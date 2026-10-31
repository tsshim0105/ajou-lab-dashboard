import AppKit
import WebKit

@MainActor final class QtiPlotBridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var owner: AppDelegate?
    var busy = false
    var lastOutput: URL?
    var processes: [Process] = []
    init(owner: AppDelegate) { self.owner = owner }
    func fail(_ text: String) -> NSError { NSError(domain:"NISML.QtiPlot",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    func installed() -> URL? {
        var candidates = [URL(fileURLWithPath:"/Applications/qtiplot.app"), FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/qtiplot.app")]
        if let found = NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.iondev.qtiplot") { candidates.append(found) }
        return candidates.first { Bundle(url:$0)?.bundleIdentifier == "com.iondev.qtiplot" && FileManager.default.isExecutableFile(atPath:$0.appendingPathComponent("Contents/MacOS/qtiplot").path) }
    }
    func authorize(_ web: WKWebView) async throws {
        guard (try await web.evaluateJavaScript("typeof admin === 'function' && admin()")) as? Bool == true else { throw fail("교수님 계정에서만 사용할 수 있습니다.") }
        let url = Lab.home.deletingLastPathComponent().appendingPathComponent("api/data")
        var request = URLRequest(url:url); request.cachePolicy = .reloadIgnoringLocalCacheData
        let cookies = await web.configuration.websiteDataStore.httpCookieStore.allCookies()
        for (key,value) in HTTPCookie.requestHeaderFields(with:Lab.matchingCookies(cookies,url:url)) { request.setValue(value,forHTTPHeaderField:key) }
        guard let session = owner?.session else { throw fail("로그인이 필요합니다.") }
        let (data,response) = try await session.data(for:request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try JSONSerialization.jsonObject(with:data) as? [String:Any],
              let user = json["user"] as? [String:Any],user["role"] as? String == "admin" else { throw fail("교수님 로그인을 다시 확인해 주세요.") }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?,String?)->Void) {
        guard let web = message.webView,web === owner?.web,message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url,Lab.isDashboard(url),
              let body = message.body as? [String:Any],let action = body["action"] as? String else { replyHandler(nil,"허용되지 않는 요청입니다.");return }
        Task { @MainActor in
            do {
                try await authorize(web)
                if action == "status" { replyHandler(["installed":installed() != nil,"bridgeVersion":1],nil);return }
                if action == "reveal" { guard let folder = lastOutput else { throw fail("생성된 결과가 없습니다.") };NSWorkspace.shared.open(folder);replyHandler(["ok":true],nil);return }
                guard action == "plot" else { throw fail("지원하지 않는 요청입니다.") }
                guard !busy else { throw fail("이전 그래프 생성이 진행 중입니다.") }
                guard let app = installed() else { throw fail("QtiPlot이 없습니다. 응용 프로그램 폴더에 설치해 주세요.") }
                guard let payload = body["payload"] as? [String:Any],JSONSerialization.isValidJSONObject(payload) else { throw fail("그래프 데이터가 올바르지 않습니다.") }
                let bytes = try JSONSerialization.data(withJSONObject:payload)
                guard bytes.count <= 4_000_000 else { throw fail("그래프 데이터가 너무 큽니다.") }
                guard let resource = Bundle.main.url(forResource:"qtiplot_bridge",withExtension:"py") else { throw fail("앱 구성 파일이 없습니다. 앱을 다시 설치해 주세요.") }
                busy = true;defer { busy = false }
                let folder = try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true).appendingPathComponent("NISML Hub/QtiPlot/"+UUID().uuidString,isDirectory:true)
                try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
                lastOutput = folder
                let input = folder.appendingPathComponent("input.json")
                try bytes.write(to:input,options:.atomic)
                try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:input.path)
                let script = folder.appendingPathComponent("qtiplot_bridge.py")
                try FileManager.default.copyItem(at:resource,to:script)
                let process = Process(); process.executableURL = app.appendingPathComponent("Contents/MacOS/qtiplot")
                process.arguments = ["-x",script.path,input.path]
                process.currentDirectoryURL = app.appendingPathComponent("Contents/MacOS")
                process.standardOutput = FileHandle.nullDevice;process.standardError = FileHandle.nullDevice
                processes.removeAll { !$0.isRunning };processes.append(process)
                try process.run()
                let result = folder.appendingPathComponent("result.json")
                for _ in 0..<120 {
                    try await Task.sleep(nanoseconds:500_000_000)
                    if let bytes = try? Data(contentsOf:result),let response = try? JSONSerialization.jsonObject(with:bytes) as? [String:Any] {
                        if response["ok"] as? Bool == true { replyHandler(response,nil);return }
                        throw fail(response["error"] as? String ?? "QtiPlot 그래프 생성에 실패했습니다.")
                    }
                    if !process.isRunning { throw fail("QtiPlot이 결과 없이 종료됐습니다. Python 지원 및 라이선스 상태를 확인해 주세요.") }
                }
                throw fail("60초 안에 결과를 확인하지 못했습니다. QtiPlot의 안내창과 Python 지원 상태를 확인해 주세요. 중복 실행을 피하려면 QtiPlot 창을 먼저 확인해 주세요.")
            } catch { replyHandler(nil,error.localizedDescription) }
        }
    }
}
