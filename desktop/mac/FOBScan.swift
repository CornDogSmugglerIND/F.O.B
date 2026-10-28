// F.O.B Scan — the desktop helper that connects a document scanner to the F.O.B app.
// Pair once with the 6-digit code from F.O.B (Scouter → Connect scanner). After that,
// pressing Scan in F.O.B makes this app run the scanner and send each card straight to Scouter.
import SwiftUI
import ImageCaptureCore
import Vision
import CoreImage
import AppKit

let SERVER = "https://fob-store.corndogsmugglerinc.workers.dev"
let VERSION = "1.0"

// MARK: - saved pairing
struct Config: Codable { var token: String; var account: String; var name: String }
enum Store {
  static var dir: URL { let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("FOB Scan"); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d }
  static var file: URL { dir.appendingPathComponent("pairing.json") }
  static func load() -> Config? { (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(Config.self, from: $0) } }
  static func save(_ c: Config?) { if let c = c { try? JSONEncoder().encode(c).write(to: file) } else { try? FileManager.default.removeItem(at: file) } }
}

// MARK: - tiny HTTP helpers
func call(_ path: String, method: String = "POST", token: String? = nil, json: Any? = nil, body: Data? = nil, type: String? = nil) async throws -> [String: Any] {
  var r = URLRequest(url: URL(string: SERVER + path)!); r.httpMethod = method; r.timeoutInterval = 60
  if let t = token { r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
  if let j = json { r.httpBody = try JSONSerialization.data(withJSONObject: j); r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
  if let b = body { r.httpBody = b; r.setValue(type ?? "application/octet-stream", forHTTPHeaderField: "Content-Type") }
  let (d, resp) = try await URLSession.shared.data(for: r)
  let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:]
  if let h = resp as? HTTPURLResponse, h.statusCode >= 400 { throw NSError(domain: "fob", code: h.statusCode, userInfo: [NSLocalizedDescriptionKey: (o["error"] as? String) ?? "Server said \(h.statusCode)"]) }
  return o
}

// MARK: - card crop: find the card's edges and straighten it; fall back to the raw page
func cropCard(_ url: URL) -> Data? {
  guard let ci = CIImage(contentsOf: url) else { return try? Data(contentsOf: url) }
  let req = VNDetectRectanglesRequest(); req.minimumAspectRatio = 0.55; req.maximumAspectRatio = 0.85; req.minimumSize = 0.25; req.maximumObservations = 1; req.minimumConfidence = 0.6; req.quadratureTolerance = 20
  try? VNImageRequestHandler(ciImage: ci).perform([req])
  var out = ci
  if let r = req.results?.first {
    let w = ci.extent.width, h = ci.extent.height
    let pt = { (p: CGPoint) in CIVector(x: p.x * w, y: p.y * h) }
    if let f = CIFilter(name: "CIPerspectiveCorrection") {
      f.setValue(ci, forKey: kCIInputImageKey)
      f.setValue(pt(r.topLeft), forKey: "inputTopLeft"); f.setValue(pt(r.topRight), forKey: "inputTopRight")
      f.setValue(pt(r.bottomLeft), forKey: "inputBottomLeft"); f.setValue(pt(r.bottomRight), forKey: "inputBottomRight")
      if let o = f.outputImage { out = o }
    }
  }
  let ctx = CIContext()
  return ctx.jpegRepresentation(of: out, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.88])
}

// MARK: - the scanner side
final class Scan: NSObject, ObservableObject, ICDeviceBrowserDelegate, ICScannerDeviceDelegate {
  @Published var config = Store.load()
  @Published var scanners: [ICScannerDevice] = []
  @Published var status = "Looking for your scanner…"
  @Published var busy = false
  @Published var lastError = ""
  @Published var sentThisBatch = 0
  private let browser = ICDeviceBrowser()
  private var active: ICScannerDevice?
  private var opening: CheckedContinuation<Bool, Never>?
  private var batch = "", seq = 0, pages = 0, uploads: Task<Void, Never>? = nil
  private var beatTimer: Timer?
  private var cmdOpts: [String: Any] = [:]

  override init() {
    super.init()
    browser.delegate = self
    browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: ICDeviceTypeMask.scanner.rawValue | ICDeviceLocationTypeMask.local.rawValue | ICDeviceLocationTypeMask.bonjour.rawValue | ICDeviceLocationTypeMask.shared.rawValue)!
    browser.start()
    beatTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.beat() }
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) { if self.scanners.isEmpty { self.status = "No scanner found. Turn it on and plug it in (USB) or put it on Wi-Fi." } }
  }

  // one physical scanner can show up twice (USB + Wi-Fi): USB first
  func isUSB(_ d: ICDevice) -> Bool { (d.transportType ?? "").contains("USB") }
  var label: String { scanners.first.map { "\($0.name ?? "Scanner") (\(isUSB($0) ? "USB" : "Wi-Fi"))" } ?? "none" }

  func deviceBrowser(_ b: ICDeviceBrowser, didAdd d: ICDevice, moreComing: Bool) {
    guard let s = d as? ICScannerDevice else { return }
    scanners.append(s); scanners.sort { isUSB($0) && !isUSB($1) }
    if !busy { status = config == nil ? "Scanner found. Pair with F.O.B to start." : "Ready. Press Scan in F.O.B." }
  }
  func deviceBrowser(_ b: ICDeviceBrowser, didRemove d: ICDevice, moreGoing: Bool) { scanners.removeAll { $0 == d } }
  func didRemove(_ device: ICDevice) { scanners.removeAll { $0 == device } }

  // MARK: pairing
  func pair(code: String) async {
    do {
      let host = Host.current().localizedName ?? "Mac"
      let o = try await call("/scan/claim", json: ["code": code.filter(\.isNumber), "name": host])
      guard let t = o["token"] as? String else { throw NSError(domain: "fob", code: 0, userInfo: [NSLocalizedDescriptionKey: "Pairing failed."]) }
      let c = Config(token: t, account: (o["account"] as? String) ?? "default", name: host)
      await MainActor.run { Store.save(c); config = c; lastError = ""; status = scanners.isEmpty ? "Paired. Waiting for the scanner…" : "Paired. Press Scan in F.O.B." }
      beat()
    } catch { await MainActor.run { lastError = error.localizedDescription } }
  }
  func unpair() { let t = config?.token; Store.save(nil); config = nil; if let t = t { Task { _ = try? await call("/scan/unpair", token: t) } } }

  // MARK: heartbeat + commands
  private var beating = false
  func beat() {
    guard let c = config, !beating else { return }
    beating = true
    let list = scanners.map { ["name": $0.name ?? "Scanner", "via": isUSB($0) ? "USB" : "Wi-Fi"] }
    let state: [String: Any] = ["status": busy ? "scanning" : (scanners.isEmpty ? "no-scanner" : "ready"), "message": status, "batch": batch, "sent": sentThisBatch, "version": VERSION]
    Task {
      defer { DispatchQueue.main.async { self.beating = false } }
      do {
        let o = try await call("/scan/beat", token: c.token, json: ["scanners": list, "state": state])
        if let cmd = o["cmd"] as? [String: Any] { await MainActor.run { self.run(cmd) } }
      } catch let e as NSError where e.code == 401 { await MainActor.run { Store.save(nil); self.config = nil; self.status = "F.O.B removed this computer. Pair again." } }
      catch { /* offline: try next beat */ }
    }
  }

  func run(_ cmd: [String: Any]) {
    switch cmd["action"] as? String ?? "scan" {
    case "scan": if !busy { Task { await startScan(cmd) } }
    case "stop": active?.cancelScan(); status = "Stopped."
    default: break
    }
  }

  // MARK: scanning
  @MainActor func open(_ s: ICScannerDevice) async -> Bool {
    if s.hasOpenSession, s.availableFunctionalUnitTypes.count > 0 { return true }
    s.delegate = self
    return await withCheckedContinuation { k in
      opening = k; s.requestOpenSession()
      DispatchQueue.main.asyncAfter(deadline: .now() + 20) { if let k = self.opening { self.opening = nil; k.resume(returning: false) } }
    }
  }
  func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
    if error != nil, let k = opening { opening = nil; k.resume(returning: false) }
  }
  func deviceDidBecomeReady(_ device: ICDevice) { if let k = opening { opening = nil; k.resume(returning: true) } }
  func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}

  @MainActor func startScan(_ cmd: [String: Any]) async {
    guard !scanners.isEmpty else { status = "No scanner found. Turn it on and plug it in."; return }
    busy = true; lastError = ""; sentThisBatch = 0; seq = 0; pages = 0; cmdOpts = cmd
    let f = DateFormatter(); f.dateFormat = "yyyyMMdd_HHmmss"
    batch = (cmd["batch"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Batch_\(f.string(from: Date()))"
    status = "Connecting to the scanner…"
    var chosen: ICScannerDevice? = nil
    for s in scanners { if await open(s) { chosen = s; break } }   // USB first; Wi-Fi if USB is held by other software
    guard let s = chosen else { busy = false; status = "Couldn't open the scanner. Close Epson ScanSmart / Epson Scan 2 and try again."; return }
    active = s
    if s.selectedFunctionalUnit.type != .documentFeeder, s.availableFunctionalUnitTypes.contains(NSNumber(value: ICScannerFunctionalUnitType.documentFeeder.rawValue)) { s.requestSelect(.documentFeeder); try? await Task.sleep(nanoseconds: 1_500_000_000) }
    let fu = s.selectedFunctionalUnit
    let dpi = (cmd["dpi"] as? Int) ?? 300
    fu.resolution = fu.supportedResolutions.contains(dpi) ? dpi : (fu.preferredResolutions.first { $0 >= 300 } ?? fu.resolution)
    fu.bitDepth = .depth8Bits; fu.pixelDataType = .RGB
    if let feeder = fu as? ICScannerFunctionalUnitDocumentFeeder {
      if !feeder.documentLoaded { busy = false; status = "Load cards in the feeder, then press Scan again."; closeSoon(); return }
      let wantA6 = ICScannerDocumentType.typeA6
      if feeder.supportedDocumentTypes.contains(Int(wantA6.rawValue)) { feeder.documentType = wantA6 }
      if feeder.supportsDuplexScanning { feeder.duplexScanningEnabled = (cmd["duplex"] as? Bool) ?? false }
    }
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("fobscan-\(UUID().uuidString)")
    try? FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
    s.transferMode = .fileBased; s.downloadsDirectory = tmp; s.documentName = batch; s.documentUTI = "public.jpeg"
    status = "Scanning…"
    s.requestScan()
  }

  // each page as it comes off the scanner: crop, send, keep order
  func scannerDevice(_ scanner: ICScannerDevice, didScanTo url: URL) {
    pages += 1; seq += 1
    let n = seq, b = batch, token = config?.token ?? ""
    let prev = uploads
    uploads = Task.detached {
      await prev?.value
      let data = cropCard(url) ?? Data()
      let file = "\(b)_\(String(format: "%04d", n)).jpg"
      var ok = false
      for attempt in 0..<3 where !ok {
        if attempt > 0 { try? await Task.sleep(nanoseconds: 2_000_000_000) }
        if (try? await call("/scan/upload?batch=\(b)&seq=\(n)&file=\(file)", method: "PUT", token: token, body: data, type: "image/jpeg")) != nil { ok = true }
      }
      try? FileManager.default.removeItem(at: url)
      await MainActor.run { if ok { self.sentThisBatch += 1; self.status = "Scanning… \(self.sentThisBatch) sent to F.O.B" } else { self.lastError = "Card \(n) didn't send. Check the internet." } }
    }
  }
  func scannerDevice(_ scanner: ICScannerDevice, didCompleteScanWithError error: Error?) {
    let wait = uploads
    Task { @MainActor in
      await wait?.value
      busy = false
      status = error == nil || sentThisBatch > 0 ? "Done: \(sentThisBatch) card\(sentThisBatch == 1 ? "" : "s") sent to Scouter." : "Scan failed: \(error!.localizedDescription)"
      beat(); closeSoon()
    }
  }
  func closeSoon() { let s = active; DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if !self.busy { s?.requestCloseSession(); self.active = nil } } }
}

// MARK: - window
let amber = Color(red: 0.96, green: 0.62, blue: 0.18)
struct Main: View {
  @ObservedObject var s: Scan
  @State var code = ""
  @State var pairing = false
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(spacing: 10) {
        Circle().fill(dot).frame(width: 10, height: 10)
        Text("F.O.B Scan").font(.system(size: 20, weight: .bold))
        Spacer()
        Text("v\(VERSION)").font(.caption).foregroundStyle(.secondary)
      }
      if s.config == nil {
        Text("Connect this computer's scanner to F.O.B").font(.headline)
        Text("In F.O.B go to Scouter → Connect scanner. Type the 6-digit code it shows.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        TextField("123456", text: $code).font(.system(size: 32, weight: .semibold, design: .rounded)).textFieldStyle(.roundedBorder).frame(width: 200)
          .onSubmit { go() }
        Button(pairing ? "Connecting…" : "Connect") { go() }.keyboardShortcut(.defaultAction).disabled(code.filter(\.isNumber).count != 6 || pairing).tint(amber).buttonStyle(.borderedProminent).controlSize(.large)
      } else {
        row("Scanner", s.label)
        row("Connected to", "F.O.B (\(s.config!.name))")
        Text(s.status).font(.system(size: 15, weight: .medium)).fixedSize(horizontal: false, vertical: true)
        HStack {
          Button("Scan now") { s.run(["action": "scan"]) }.disabled(s.busy || s.scanners.isEmpty).tint(amber).buttonStyle(.borderedProminent)
          Spacer()
          Button("Disconnect") { s.unpair() }.buttonStyle(.borderless).foregroundStyle(.secondary)
        }
        Text("You can close this window. F.O.B Scan keeps listening for the Scan button in F.O.B.").font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      if !s.lastError.isEmpty { Text(s.lastError).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
    }
    .padding(24).frame(width: 380)
  }
  var dot: Color { s.config == nil ? .gray : (s.scanners.isEmpty ? .orange : (s.busy ? amber : .green)) }
  func row(_ a: String, _ b: String) -> some View { HStack { Text(a).foregroundStyle(.secondary).frame(width: 100, alignment: .leading); Text(b).fontWeight(.medium) } }
  func go() { guard code.filter(\.isNumber).count == 6 else { return }; pairing = true; Task { await s.pair(code: code); pairing = false } }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool { if !hasVisibleWindows { for w in sender.windows { w.makeKeyAndOrderFront(nil) } }; return true }
}

@main
struct FOBScanApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @StateObject var scan = Scan()
  var body: some Scene {
    Window("F.O.B Scan", id: "main") { Main(s: scan) }.windowResizability(.contentSize)
  }
}
