import AppKit
import SwiftUI
import AVFoundation
import WebKit

struct FloatingMeeting: Identifiable { let id: String; let title: String; var quick: Bool = true; var participants: String = ""; var cover: String = "" }
@MainActor final class MeetingPanelModel: ObservableObject {
    @Published var topics: [FloatingMeeting] = []
    @Published var covers: [String:NSImage] = [:]
    @Published var participantNames: [String] = []
    @Published var otherExpanded = false
    var quickTopics: [FloatingMeeting] { topics.filter { $0.quick } }
    var otherTopics: [FloatingMeeting] { topics.filter { !$0.quick } }
    var quickHeight: CGFloat { min(228,CGFloat((quickTopics.count+2)/3)*72+24) }
    var otherHeight: CGFloat { otherExpanded ? min(228,CGFloat((otherTopics.count+2)/3)*72+24) : 0 }
    var expandedHeight: CGFloat { quickHeight + 40 + (otherTopics.isEmpty ? 0 : 36 + otherHeight) }
    @Published var selected = "__unclassified__"
    @Published var elapsed = "00:00"
    @Published var paused = false
    @Published var expanded = false
    @Published var working = false
    @Published var recording = false
    @Published var readyToStart = false
    @Published var cancelPending = false
    @Published var message = ""
    var action: (String, String?) -> Void = { _, _ in }
    var resize: () -> Void = {}
    var current: String { topics.first { $0.id == selected }?.title ?? "미분류" }
}
private final class PanelDragView: NSView {
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    override func resetCursorRects() { addCursorRect(bounds,cursor:.openHand) }
}
private struct PanelDragHandle: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { let v=PanelDragView();v.toolTip="드래그하여 패널 이동";return v }
    func updateNSView(_ view:NSView,context:Context) {}
}
private struct MeetingPanelView: View {
    @ObservedObject var model: MeetingPanelModel
    let ink = Color(red:0.15,green:0.25,blue:0.34)
    let aurora = LinearGradient(colors:[Color(red:0.89,green:0.99,blue:0.95),Color(red:0.96,green:0.99,blue:1),Color(red:0.96,green:0.92,blue:1)],startPoint:.leading,endPoint:.trailing)
    var body: some View {
        VStack(spacing:0) {
            if model.expanded {
                HStack(spacing:7) {
                    Text("빠른 전환").font(.system(size:12,weight:.medium))
                    Text(model.participantNames.joined(separator:" · ")).font(.system(size:11)).lineLimit(1).foregroundColor(.secondary)
                    Spacer(minLength:4)
                    Button { toggle() } label: { Image(systemName:"xmark") }.accessibilityLabel("미팅 목록 닫기")
                }.padding(.horizontal,16).padding(.top,13)
                topicGrid(model.quickTopics,height:model.quickHeight)
                if !model.otherTopics.isEmpty {
                    Button { model.otherExpanded.toggle();model.resize() } label: {
                        HStack { Image(systemName:model.otherExpanded ? "chevron.down" : "chevron.right");Text("다른 연구주제 \(model.otherTopics.count)개");Spacer() }.font(.system(size:12)).padding(.horizontal,16).frame(height:36)
                    }.accessibilityLabel("다른 연구주제 펼치기")
                    if model.otherExpanded { topicGrid(model.otherTopics,height:model.otherHeight) }
                }
            }
            HStack(spacing:10) {
                Image(systemName:"circle.grid.2x3.fill").foregroundColor(.gray).frame(width:26,height:38).overlay(PanelDragHandle()).accessibilityLabel("패널 이동 손잡이")
                Circle().fill(!model.recording ? Color.gray : model.paused ? Color.orange : Color.red).frame(width:8,height:8)
                Text(model.recording ? model.elapsed : "녹음 대기").font(.system(size:16,weight:.semibold,design:.monospaced)).frame(width:72)
                Button { toggle() } label: { HStack { Text(model.current).lineLimit(1); Spacer(minLength:4); Image(systemName:model.expanded ? "chevron.down" : "chevron.up").font(.system(size:11)) }.padding(10).background(Color.white.opacity(0.7)).cornerRadius(11) }.accessibilityLabel("현재 미팅: " + model.current + ", 목록 열기")
                if model.recording {
                    Button { model.action("pause",nil) } label: { Image(systemName:model.paused ? "play.fill" : "pause.fill").frame(width:24,height:28) }.help((model.paused ? "녹음 재개" : "일시정지") + " · ⌃⌥⌘R").accessibilityLabel(model.paused ? "녹음 재개" : "일시정지").disabled(model.working)
                }
                Divider().frame(height:22)
                Button { model.action(model.recording ? "summary" : "start",nil) } label: {
                    Label(model.recording ? "회의 요약 시작" : model.readyToStart ? "새 회의 녹음 시작" : "업로드 중…",systemImage:model.recording ? "doc.text" : "mic.fill")
                        .font(.system(size:12,weight:.semibold)).padding(.horizontal,10).frame(height:36)
                        .foregroundColor(Color(red:0.14,green:0.36,blue:0.58)).background(Color.white.opacity(0.75)).cornerRadius(10)
                }.help(model.recording ? "현재 녹음을 마무리하고 회의 요약을 시작합니다. 패널은 유지됩니다." : "선택한 연구주제로 새 회의를 녹음합니다. 이전 회의 요약은 계속됩니다.")
                    .disabled(model.working || (!model.recording && !model.readyToStart))
                if model.recording || model.cancelPending {
                    Button { model.action("cancel",nil) } label: { Image(systemName:"xmark").frame(width:22,height:28) }.help("현재 회의 취소 · 요약하지 않음").accessibilityLabel("회의 취소").disabled(model.working)
                }
                if !model.recording {
                    Button { model.action("hide",nil) } label: { Image(systemName:"xmark").font(.system(size:11)).frame(width:18,height:28) }.help("플로팅 바 숨기기 · 요약은 계속 진행됩니다.").accessibilityLabel("플로팅 바 숨기기")
                }
            }.padding(13).frame(height:66)
            if !model.message.isEmpty { Text(model.message).font(.system(size:11)).lineLimit(2).padding(.horizontal,14).padding(.bottom,8) }
        }.foregroundColor(ink).buttonStyle(.plain).background(aurora).clipShape(RoundedRectangle(cornerRadius:19)).overlay(RoundedRectangle(cornerRadius:19).stroke(Color(red:0.83,green:0.9,blue:0.94),lineWidth:1)).preferredColorScheme(.light)
    }
    func topicGrid(_ topics:[FloatingMeeting],height:CGFloat) -> some View {
        ScrollView {
            LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:7),count:3),spacing:7) {
                ForEach(topics) { item in
                    Button { model.action("topic",item.id) } label: {
                        HStack {
                            VStack(alignment:.leading,spacing:4) {
                                Text(item.title).font(.system(size:12,weight:.medium)).lineLimit(2).multilineTextAlignment(.leading)
                                if !item.participants.isEmpty { Text(item.participants).font(.system(size:10)).foregroundColor(.secondary).lineLimit(1) }
                            }
                            Spacer(minLength:0)
                            if item.id == model.selected { Image(systemName:"checkmark").font(.system(size:11,weight:.semibold)) }
                        }.padding(10).frame(maxWidth:.infinity,minHeight:65,alignment:.leading)
                        .background {
                            GeometryReader { geometry in
                                ZStack {
                                    Color.white.opacity(0.85)
                                    if let image=model.covers[item.cover] { Image(nsImage:image).resizable().scaledToFill().frame(width:geometry.size.width,height:geometry.size.height).clipped().opacity(0.7)
                                        LinearGradient(colors:[Color.white.opacity(0.72),.clear],startPoint:.leading,endPoint:.trailing)
                                    }
                                }
                            }
                        }.cornerRadius(10).overlay(RoundedRectangle(cornerRadius:10).stroke(item.id == model.selected ? Color(red:0.77,green:0.65,blue:0.42) : .clear,lineWidth:2))
                    }.disabled(model.working).accessibilityLabel(item.title + (item.id == model.selected ? " 선택됨" : ""))
                }
            }.padding(12)
        }.frame(height:height)
    }
    func toggle() { model.expanded.toggle(); model.resize() }
}
final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
@MainActor final class MeetingController: NSObject, WKScriptMessageHandlerWithReply, AVAudioRecorderDelegate {
    weak var owner: AppDelegate?
    let model=MeetingPanelModel()
    var panel: FloatingPanel?
    var panelAnchor: NSPoint?
    var resizingPanel=false
    var moveObserver: NSObjectProtocol?
    var recorder: AVAudioEngine?
    var segmented: SegmentedAudio?
    var processingActivity: NSObjectProtocol?
    var recordingID: String?
    var clock: Timer?
    var activity: NSObjectProtocol?
    var protectsSession=false
    var keepPanelVisible=false
    var commandPending=false
    var lastCompletedParts=0
    var processingClock: Timer?
    var audioDirectory: URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("NISML Dashboard/Meeting Audio",isDirectory:true) }
    var recording: Bool { recorder != nil }
    init(owner: AppDelegate) { self.owner=owner; super.init(); model.action = { [weak self] action,topic in self?.command(action,topic) }; model.resize = { [weak self] in self?.resize() } }
    func file(_ id:String) throws -> URL { guard UUID(uuidString:id) != nil else { throw fail("회의 식별자가 올바르지 않습니다.") }; return audioDirectory.appendingPathComponent(id+".m4a") }
    func fail(_ text:String)->NSError { NSError(domain:"NISMLRecording",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    func start(_ id:String) async throws {
        guard recorder == nil else { throw fail("이미 녹음 중입니다.") }
        guard await AVCaptureDevice.requestAccess(for:.audio) else { throw fail("시스템 설정에서 NISML Hub의 마이크 권한을 허용해주세요.") }
        try FileManager.default.createDirectory(at:audioDirectory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        let folder=try partsDirectory(id)
        guard !FileManager.default.fileExists(atPath:folder.path) else { throw fail("이 회의의 녹음 파일이 이미 있습니다.") }
        let writer=try SegmentedAudio(directory:folder), audio=AVAudioEngine(), input=audio.inputNode
        let format=input.outputFormat(forBus:0)
        guard format.sampleRate>0,format.channelCount>0 else { throw fail("마이크를 확인해주세요.") }
        input.installTap(onBus:0,bufferSize:4096,format:format) { buffer,_ in writer.append(buffer) }
        do { try audio.start() } catch { input.removeTap(onBus:0);throw error }
        lastCompletedParts=0;recorder=audio;segmented=writer;recordingID=id;protectsSession=true;keepPanelVisible=true;model.recording=true;model.readyToStart=false;model.paused=false;model.message="";show()
        activity=ProcessInfo.processInfo.beginActivity(options:[.userInitiated,.idleSystemSleepDisabled],reason:"연구미팅 녹음 유지")
        clock=Timer.scheduledTimer(withTimeInterval:0.5,repeats:true) { [weak self] _ in Task { @MainActor in self?.tick() } }
    }
    func tick() {
        guard recorder != nil,let writer=segmented else { return }
        let (duration,parts,error)=writer.snapshot(),t=Int(duration);model.elapsed=String(format:"%02d:%02d",t/60,t%60)
        if parts.count != lastCompletedParts { lastCompletedParts=parts.count;Task { @MainActor in _ = try? await owner?.web?.evaluateJavaScript("window.nismlRecorderSegmentReady?.()") } }
        if let error { model.message="녹음 장치 오류: " + error;command("stop",nil,confirm:false) }
    }
    func partsDirectory(_ id:String) throws -> URL { _ = try file(id);return audioDirectory.appendingPathComponent(id+"-parts",isDirectory:true) }
    func partFile(_ id:String,_ part:Int) throws -> URL { guard part>=0 else { throw fail("파일 번호를 확인해주세요.") };return try partsDirectory(id).appendingPathComponent("\(part).m4a") }
    func parts(_ id:String) throws -> [String:Any] {
        if id==recordingID,let segmented { let (duration,items,error)=segmented.snapshot();if let error { throw fail(error) };return ["duration":duration,"parts":items] }
        let url=try partsDirectory(id).appendingPathComponent("manifest.json")
        return try JSONSerialization.jsonObject(with:Data(contentsOf:url)) as? [String:Any] ?? [:]
    }
    func stop() throws -> [String:Any] {
        guard let id=recordingID else { throw fail("녹음 기록이 없습니다.") }
        recorder?.stop();recorder?.inputNode.removeTap(onBus:0);recorder=nil
        clock?.invalidate();clock=nil
        try segmented?.stop()
        if let activity { ProcessInfo.processInfo.endActivity(activity);self.activity=nil }
        model.recording=false;model.readyToStart=false;model.working=true;model.message="마지막 구간 업로드 중 · 완료되면 새 회의를 시작할 수 있습니다.";resize();return try parts(id)
    }
    func show() {
        if panel == nil {
            let p=FloatingPanel(contentRect:NSRect(x:0,y:0,width:620,height:66),styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
            p.alphaValue=0.78;p.level = .floating;p.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary];p.hidesOnDeactivate=false;p.isFloatingPanel=true;p.isOpaque=false;p.backgroundColor = .clear;p.hasShadow=true;p.isMovableByWindowBackground=true;p.isReleasedWhenClosed=false
            let host=NSHostingView(rootView:MeetingPanelView(model:model));host.sizingOptions=[];p.contentView=host
            p.setFrameAutosaveName("MeetingFloatingPanel");if !p.setFrameUsingName("MeetingFloatingPanel"), let screen=NSScreen.main { p.setFrameOrigin(NSPoint(x:screen.visibleFrame.midX-310,y:screen.visibleFrame.minY+80)) }
            panel=p;panelAnchor=p.frame.origin
            moveObserver=NotificationCenter.default.addObserver(forName:NSWindow.didMoveNotification,object:p,queue:.main) { [weak self] _ in
                MainActor.assumeIsolated { guard let self,!self.resizingPanel else{return};self.panelAnchor=self.panel?.frame.origin }
            }
        }
        resize();panel?.orderFrontRegardless()
    }
    func resize() {
        guard let panel else{return};let h:CGFloat=66+(model.expanded ? model.expandedHeight:0)+(model.message.isEmpty ? 0:38)
        var f=NSRect(origin:panelAnchor ?? panel.frame.origin,size:NSSize(width:620,height:h))
        if let screen=panel.screen ?? NSScreen.main { f.origin.x=max(screen.visibleFrame.minX,min(f.origin.x,screen.visibleFrame.maxX-f.width));f.origin.y=max(screen.visibleFrame.minY,min(f.origin.y,screen.visibleFrame.maxY-f.height)) }
        if panel.frame != f { resizingPanel=true;panel.setFrame(f,display:true);resizingPanel=false }
    }
    func command(_ action:String,_ topic:String?,confirm:Bool=true) {
        if action == "hide" && !recording { keepPanelVisible=false;panel?.orderOut(nil);return }
        guard !commandPending,let web=owner?.web, let url=web.url,Lab.isDashboard(url) else { model.message="대시보드를 다시 열어주세요.";return }
        if action == "cancel" { let box=NSAlert();box.messageText="현재 회의를 취소할까요?";box.informativeText="녹음을 멈추고 이 회의의 전사·요약을 폐기합니다. 이미 처리된 API 비용은 취소되지 않습니다. 다른 회의는 유지됩니다.";box.addButton(withTitle:"회의 취소");box.addButton(withTitle:"계속 녹음");guard box.runModal() == .alertFirstButtonReturn else{return} }
        if action == "stop" && confirm { let box=NSAlert();box.messageText="녹음을 저장하고 종료할까요?";box.addButton(withTitle:"저장 후 종료");box.addButton(withTitle:"계속 녹음");guard box.runModal() == .alertFirstButtonReturn else{return} }
        let payload:[String:Any]=["action":action,"topic":topic ?? ""]
        commandPending=true;model.working=true
        Task { @MainActor in
            defer { commandPending=false;model.working=false;resize() }
            do { _ = try await web.callAsyncJavaScript("if (!window.nismlRecorderCommand) throw new Error('대시보드를 새로고침해주세요.'); return await window.nismlRecorderCommand(command);",arguments:["command":payload],in:nil,contentWorld:.page)
                if action == "topic" { model.expanded=false;model.otherExpanded=false }
            } catch { model.message="작업을 완료하지 못했습니다. 대시보드에서 연결 상태와 안내를 확인해주세요.";owner?.showDashboard() }
        }
    }

    func userContentController(_ userContentController: WKUserContentController,didReceive message:WKScriptMessage,replyHandler:@escaping(Any?,String?)->Void) {
        guard message.webView === owner?.web,message.frameInfo.isMainFrame,let url=message.frameInfo.request.url,Lab.isDashboard(url),let body=message.body as? [String:Any],let action=body["action"] as? String else { replyHandler(nil,"허용되지 않는 요청입니다.");return }
        Task { @MainActor in
            do {
                if action == "state" {
                    let admin=body["admin"] as? Bool == true
                    if admin && body["backgroundProcessing"] as? Bool == true { if processingActivity == nil { processingActivity=ProcessInfo.processInfo.beginActivity(options:[.userInitiated,.idleSystemSleepDisabled],reason:"회의 전사 및 요약 완료");processingClock=Timer.scheduledTimer(withTimeInterval:5,repeats:true) { [weak controller = self] _ in Task { @MainActor in _ = try? await controller?.owner?.web?.evaluateJavaScript("if(typeof mrPump==='function')mrPump();void 0") } } } }
                    else if let processingActivity { ProcessInfo.processInfo.endActivity(processingActivity);self.processingActivity=nil;processingClock?.invalidate();processingClock=nil }
                    if !admin { model.covers=[:];keepPanelVisible=false;panel?.orderOut(nil);replyHandler(["ok":true],nil);return }
                    let items=body["topics"] as? [[String:String]] ?? [];model.topics=items.prefix(300).compactMap { x in guard let id=x["id"],let title=x["title"] else{return nil};return FloatingMeeting(id:id,title:String(title.prefix(120)),quick:x["quick"] != "false",participants:String((x["participants"] ?? "").prefix(180)),cover:x["cover"] ?? "") }
                    model.participantNames=body["participantNames"] as? [String] ?? [];resize()
                    model.selected=body["selected"] as? String ?? "__unclassified__";protectsSession=recording || body["protect"] as? Bool == true
                    model.recording=recording || body["active"] as? Bool == true
                    model.cancelPending=body["cancelPending"] as? Bool == true
                    model.readyToStart = !model.recording && body["startReady"] as? Bool == true
                    if !model.recording && model.readyToStart { model.message="이전 회의는 별도로 처리됩니다. 주제를 선택하고 새 녹음을 시작하세요." }
                    if !model.recording && !protectsSession && !keepPanelVisible { panel?.orderOut(nil) }
                    replyHandler(["ok":true],nil);return
                }
                // Independently check current page role before any audio operation.
                guard let web=owner?.web, (try await web.evaluateJavaScript("typeof admin === 'function' && admin()")) as? Bool == true else { throw fail("교수님만 녹음에 접근할 수 있습니다.") }
                switch action {
                case "covers":
                    if let images=body["images"] as? [String:String] { for (key,value) in images.prefix(300) { if value.count<=80000,let data=Data(base64Encoded:value),let image=NSImage(data:data) { model.covers[key]=image } };let active=Set(model.topics.map { $0.cover });model.covers=model.covers.filter { active.contains($0.key) } };replyHandler(["ok":true],nil)
                case "capabilities": replyHandler(["segmentedRecording":true,"segmentSeconds":300],nil)
                case "parts": guard let id=body["id"] as? String else{throw fail("회의 ID가 없습니다.")};replyHandler(try parts(id),nil)
                case "uploaded": model.working=false;model.message="";replyHandler(["ok":true],nil)
                case "purge": guard let id=body["id"] as? String,!(id==recordingID && recording) else{throw fail("녹음 중에는 삭제할 수 없습니다.")};for path in [try file(id),try partsDirectory(id)] { if FileManager.default.fileExists(atPath:path.path) { try FileManager.default.removeItem(at:path) } };replyHandler(["ok":true],nil)
                case "start": guard let id=body["id"] as? String else{throw fail("회의 ID가 없습니다.")};try await start(id);replyHandler(["ok":true],nil)
                case "pause": guard recorder != nil else{throw fail("녹음 중이 아닙니다.")};segmented?.setPaused(true);model.paused=true;replyHandler(["ok":true],nil)
                case "resume": guard recorder != nil else{throw fail("녹음을 재개하지 못했습니다.")};segmented?.setPaused(false);model.paused=false;replyHandler(["ok":true],nil)
                case "stop": replyHandler(try stop(),nil)
                case "read": guard let id=body["id"] as? String,let offset=body["offset"] as? Int,offset>=0 else{throw fail("파일 요청이 올바르지 않습니다.")};let path=try (body["part"] as? Int).map { try partFile(id,$0) } ?? file(id);let handle=try FileHandle(forReadingFrom:path);defer{try? handle.close()};try handle.seek(toOffset:UInt64(offset));let bytes=try handle.read(upToCount:450000) ?? Data();replyHandler(["base64":bytes.base64EncodedString(),"length":bytes.count],nil)
                case "recover": guard let id=body["id"] as? String else{throw fail("회의 ID가 없습니다.")};let path=try file(id);let size=(try FileManager.default.attributesOfItem(atPath:path.path)[.size] as? NSNumber)?.intValue ?? 0;let duration=(try? AVAudioPlayer(contentsOf:path).duration) ?? 0;replyHandler(["size":size,"duration":duration],nil)
                case "ack": guard recorder == nil,let id=body["id"] as? String else{throw fail("녹음 파일은 유지됩니다.")};try FileManager.default.removeItem(at:file(id));model.message="";model.working=false;replyHandler(["ok":true],nil)
                default: throw fail("지원하지 않는 녹음 동작입니다.")
                }
            } catch { replyHandler(nil,error.localizedDescription) }
        }
    }
    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder:AVAudioRecorder,error:Error?) { Task { @MainActor in self.model.message="녹음 장치 오류 · 원본 파일은 보관됩니다.";self.command("stop",nil,confirm:false) } }
}
