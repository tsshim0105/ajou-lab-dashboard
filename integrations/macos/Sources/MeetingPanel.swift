import AppKit
import SwiftUI
import AVFoundation
import WebKit

struct FloatingMeeting: Identifiable { let id: String; let title: String }
@MainActor final class MeetingPanelModel: ObservableObject {
    @Published var topics: [FloatingMeeting] = []
    @Published var selected = "__unclassified__"
    @Published var elapsed = "00:00"
    @Published var paused = false
    @Published var expanded = false
    @Published var working = false
    @Published var message = ""
    var action: (String, String?) -> Void = { _, _ in }
    var resize: () -> Void = {}
    var current: String { topics.first { $0.id == selected }?.title ?? "미분류" }
}
private struct MeetingPanelView: View {
    @ObservedObject var model: MeetingPanelModel
    let ink = Color(red:0.15,green:0.25,blue:0.34)
    let aurora = LinearGradient(colors:[Color(red:0.89,green:0.99,blue:0.95),Color(red:0.96,green:0.99,blue:1),Color(red:0.96,green:0.92,blue:1)],startPoint:.leading,endPoint:.trailing)
    var body: some View {
        VStack(spacing:0) {
            if model.expanded {
                HStack { Text("내 미팅").font(.system(size:12,weight:.medium)); Spacer(); Button { toggle() } label: { Image(systemName:"xmark") }.accessibilityLabel("미팅 목록 닫기") }.padding(.horizontal,16).padding(.top,13)
                ScrollView {
                    LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:7),count:3),spacing:7) {
                        ForEach(model.topics) { item in
                            Button { model.action("topic",item.id) } label: {
                                HStack { Text(item.title).font(.system(size:12,weight:.medium)).lineLimit(2).multilineTextAlignment(.leading); Spacer(minLength:0); if item.id == model.selected { Image(systemName:"checkmark").font(.system(size:11,weight:.semibold)) } }
                                    .padding(10).frame(maxWidth:.infinity,minHeight:52,alignment:.leading)
                                    .background(item.id == model.selected ? Color(red:0.85,green:0.94,blue:0.98) : Color.white.opacity(0.85)).cornerRadius(10)
                            }.disabled(model.working).accessibilityLabel(item.title + (item.id == model.selected ? " 선택됨" : ""))
                        }
                    }.padding(12)
                }.frame(height:min(228,CGFloat((model.topics.count+2)/3)*59+24))
            }
            HStack(spacing:10) {
                Image(systemName:"circle.grid.2x3.fill").foregroundColor(.gray).help("빈 곳을 드래그하여 위치 이동")
                Circle().fill(model.paused ? Color.orange : Color.red).frame(width:8,height:8)
                Text(model.elapsed).font(.system(size:16,weight:.semibold,design:.monospaced)).frame(width:72)
                Button { toggle() } label: { HStack { Text(model.current).lineLimit(1); Spacer(minLength:4); Image(systemName:model.expanded ? "chevron.down" : "chevron.up").font(.system(size:11)) }.padding(10).background(Color.white.opacity(0.7)).cornerRadius(11) }.accessibilityLabel("현재 미팅: " + model.current + ", 목록 열기")
                Button { model.action("pause",nil) } label: { Image(systemName:model.paused ? "play.fill" : "pause.fill").frame(width:24,height:28) }.help(model.paused ? "녹음 재개" : "일시정지").accessibilityLabel(model.paused ? "녹음 재개" : "일시정지").disabled(model.working)
                Divider().frame(height:22)
                Button { model.action("stop",nil) } label: { Image(systemName:"stop.fill").foregroundColor(Color(red:0.73,green:0.25,blue:0.34)).frame(width:24,height:28) }.help("녹음 저장 후 종료").accessibilityLabel("녹음 종료").disabled(model.working)
            }.padding(13).frame(height:66)
            if !model.message.isEmpty { Text(model.message).font(.system(size:11)).lineLimit(2).padding(.horizontal,14).padding(.bottom,8) }
        }.foregroundColor(ink).buttonStyle(.plain).background(aurora).clipShape(RoundedRectangle(cornerRadius:19)).overlay(RoundedRectangle(cornerRadius:19).stroke(Color(red:0.83,green:0.9,blue:0.94),lineWidth:1)).preferredColorScheme(.light)
    }
    func toggle() { model.expanded.toggle(); model.resize() }
}
final class FloatingPanel: NSPanel {
    var fade: DispatchWorkItem?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func mouseEntered(with event: NSEvent) { fade?.cancel(); NSAnimationContext.runAnimationGroup { $0.duration=0.2; animator().alphaValue=1 } }
    override func mouseExited(with event: NSEvent) {
        fade?.cancel(); let task=DispatchWorkItem { [weak self] in guard let self else{return}; NSAnimationContext.runAnimationGroup { $0.duration=0.28; self.animator().alphaValue=0.78 } }; fade=task; DispatchQueue.main.asyncAfter(deadline:.now()+0.45,execute:task)
    }
}
@MainActor final class MeetingController: NSObject, WKScriptMessageHandlerWithReply, AVAudioRecorderDelegate {
    weak var owner: AppDelegate?
    let model=MeetingPanelModel()
    var panel: FloatingPanel?
    var recorder: AVAudioRecorder?
    var recordingID: String?
    var clock: Timer?
    var activity: NSObjectProtocol?
    var protectsSession=false
    var commandPending=false
    var limitHandled=false
    var audioDirectory: URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("NISML Dashboard/Meeting Audio",isDirectory:true) }
    var recording: Bool { recorder != nil }
    init(owner: AppDelegate) { self.owner=owner; super.init(); model.action = { [weak self] action,topic in self?.command(action,topic) }; model.resize = { [weak self] in self?.resize() } }
    func file(_ id:String) throws -> URL { guard UUID(uuidString:id) != nil else { throw fail("회의 식별자가 올바르지 않습니다.") }; return audioDirectory.appendingPathComponent(id+".m4a") }
    func fail(_ text:String)->NSError { NSError(domain:"NISMLRecording",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    func start(_ id:String) async throws {
        guard recorder == nil else { throw fail("이미 녹음 중입니다.") }
        guard await AVCaptureDevice.requestAccess(for:.audio) else { throw fail("시스템 설정에서 NISML Dashboard의 마이크 권한을 허용해주세요.") }
        try FileManager.default.createDirectory(at:audioDirectory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let url=try file(id);guard !FileManager.default.fileExists(atPath:url.path) else { throw fail("이 회의의 녹음 파일이 이미 있습니다.") }
        let audio=try AVAudioRecorder(url:url,settings:[AVFormatIDKey:kAudioFormatMPEG4AAC,AVSampleRateKey:24000,AVNumberOfChannelsKey:1,AVEncoderBitRateKey:48000])
        audio.delegate=self;guard audio.prepareToRecord(),audio.record() else { throw fail("마이크 녹음을 시작하지 못했습니다.") }
        try? FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
        recorder=audio;recordingID=id;protectsSession=true;limitHandled=false;model.paused=false;model.message="";show()
        activity=ProcessInfo.processInfo.beginActivity(options:[.userInitiated,.idleSystemSleepDisabled],reason:"연구미팅 녹음 유지")
        clock=Timer.scheduledTimer(withTimeInterval:0.5,repeats:true) { [weak self] _ in Task { @MainActor in self?.tick() } }
    }
    func tick() {
        guard let audio=recorder else { return }; let t=Int(audio.currentTime);model.elapsed=String(format:"%02d:%02d",t/60,t%60)
        if t>=3600 && !limitHandled { limitHandled=true;audio.pause();model.paused=true;command("stop",nil,confirm:false) }
    }
    func stop() throws -> [String:Any] {
        guard let id=recordingID else { throw fail("녹음 기록이 없습니다.") }
        recorder?.stop();recorder=nil;clock?.invalidate();clock=nil
        if let activity { ProcessInfo.processInfo.endActivity(activity);self.activity=nil }
        let path=try file(id);let size=(try FileManager.default.attributesOfItem(atPath:path.path)[.size] as? NSNumber)?.intValue ?? 0
        model.working=true;model.message="녹음 저장 중…";resize();return ["size":size,"id":id]
    }
    func show() {
        if panel == nil {
            let p=FloatingPanel(contentRect:NSRect(x:0,y:0,width:620,height:66),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
            p.level = .floating;p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary];p.hidesOnDeactivate=false;p.isFloatingPanel=true;p.isOpaque=false;p.backgroundColor = .clear;p.hasShadow=true;p.isMovableByWindowBackground=true;p.isReleasedWhenClosed=false
            let host=NSHostingView(rootView:MeetingPanelView(model:model));p.contentView=host
            host.addTrackingArea(NSTrackingArea(rect:.zero,options:[.mouseEnteredAndExited,.activeAlways,.inVisibleRect],owner:p,userInfo:nil))
            p.setFrameAutosaveName("MeetingFloatingPanel");if !p.setFrameUsingName("MeetingFloatingPanel"), let screen=NSScreen.main { p.setFrameOrigin(NSPoint(x:screen.visibleFrame.midX-310,y:screen.visibleFrame.minY+80)) }
            panel=p
        }
        resize();panel?.orderFrontRegardless()
    }
    func resize() {
        guard let panel else{return};let h:CGFloat=66+(model.expanded ? min(228,CGFloat((model.topics.count+2)/3)*59+24)+36:0)+(model.message.isEmpty ? 0:38)
        var f=panel.frame;f.size=NSSize(width:620,height:h)
        if let screen=panel.screen ?? NSScreen.main { f.origin.x=max(screen.visibleFrame.minX,min(f.origin.x,screen.visibleFrame.maxX-f.width));f.origin.y=max(screen.visibleFrame.minY,min(f.origin.y,screen.visibleFrame.maxY-f.height)) }
        panel.setFrame(f,display:true)
    }
    func command(_ action:String,_ topic:String?,confirm:Bool=true) {
        guard !commandPending,let web=owner?.web, let url=web.url,Lab.isDashboard(url) else { model.message="대시보드를 다시 열어주세요.";return }
        if action == "stop" && confirm { let box=NSAlert();box.messageText="녹음을 저장하고 종료할까요?";box.addButton(withTitle:"저장 후 종료");box.addButton(withTitle:"계속 녹음");guard box.runModal() == .alertFirstButtonReturn else{return} }
        let payload:[String:Any]=["action":action,"topic":topic ?? ""]
        commandPending=true;model.working=true
        Task { @MainActor in
            defer { commandPending=false;model.working=false;resize() }
            do { _ = try await web.callAsyncJavaScript("if (!window.nismlRecorderCommand) throw new Error('대시보드를 새로고침해주세요.'); return await window.nismlRecorderCommand(command);",arguments:["command":payload],in:nil,contentWorld:.page)
                if action == "topic" { model.expanded=false }
            } catch { model.message="연결 오류 · 녹음은 앱에 보관됩니다. 대시보드를 확인해주세요.";owner?.showDashboard() }
        }
    }

    func userContentController(_ userContentController: WKUserContentController,didReceive message:WKScriptMessage,replyHandler:@escaping(Any?,String?)->Void) {
        guard message.webView === owner?.web,message.frameInfo.isMainFrame,let url=message.frameInfo.request.url,Lab.isDashboard(url),let body=message.body as? [String:Any],let action=body["action"] as? String else { replyHandler(nil,"허용되지 않는 요청입니다.");return }
        Task { @MainActor in
            do {
                if action == "state" {
                    let admin=body["admin"] as? Bool == true
                    if !admin { panel?.orderOut(nil);replyHandler(["ok":true],nil);return }
                    let items=body["topics"] as? [[String:String]] ?? [];model.topics=items.prefix(300).compactMap { x in guard let id=x["id"],let title=x["title"] else{return nil};return FloatingMeeting(id:id,title:String(title.prefix(120))) }
                    model.selected=body["selected"] as? String ?? "__unclassified__";protectsSession=recording || body["protect"] as? Bool == true
                    if body["active"] as? Bool != true && !recording && !protectsSession { panel?.orderOut(nil) }
                    replyHandler(["ok":true],nil);return
                }
                // Independently check current page role before any audio operation.
                guard let web=owner?.web, (try await web.evaluateJavaScript("typeof admin === 'function' && admin()")) as? Bool == true else { throw fail("교수님만 녹음에 접근할 수 있습니다.") }
                switch action {
                case "start": guard let id=body["id"] as? String else{throw fail("회의 ID가 없습니다.")};try await start(id);replyHandler(["ok":true],nil)
                case "pause": guard let r=recorder else{throw fail("녹음 중이 아닙니다.")};r.pause();model.paused=true;replyHandler(["ok":true],nil)
                case "resume": guard let r=recorder,r.record() else{throw fail("녹음을 재개하지 못했습니다.")};model.paused=false;replyHandler(["ok":true],nil)
                case "stop": replyHandler(try stop(),nil)
                case "read": guard let id=body["id"] as? String,let offset=body["offset"] as? Int,offset>=0 else{throw fail("파일 요청이 올바르지 않습니다.")};let path=try file(id);let handle=try FileHandle(forReadingFrom:path);defer{try? handle.close()};try handle.seek(toOffset:UInt64(offset));let bytes=try handle.read(upToCount:450000) ?? Data();replyHandler(["base64":bytes.base64EncodedString(),"length":bytes.count],nil)
                case "recover": guard let id=body["id"] as? String else{throw fail("회의 ID가 없습니다.")};let path=try file(id);let size=(try FileManager.default.attributesOfItem(atPath:path.path)[.size] as? NSNumber)?.intValue ?? 0;let duration=(try? AVAudioPlayer(contentsOf:path).duration) ?? 0;replyHandler(["size":size,"duration":duration],nil)
                case "ack": guard recorder == nil,let id=body["id"] as? String else{throw fail("녹음 파일은 유지됩니다.")};try FileManager.default.removeItem(at:file(id));model.message="";model.working=false;replyHandler(["ok":true],nil)
                default: throw fail("지원하지 않는 녹음 동작입니다.")
                }
            } catch { replyHandler(nil,error.localizedDescription) }
        }
    }
    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder:AVAudioRecorder,error:Error?) { Task { @MainActor in self.model.message="녹음 장치 오류 · 원본 파일은 보관됩니다.";self.command("stop",nil,confirm:false) } }
}
