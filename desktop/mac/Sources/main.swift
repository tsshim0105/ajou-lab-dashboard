import AppKit
import WebKit
import UserNotifications
import ServiceManagement

final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, UNUserNotificationCenterDelegate, WKScriptMessageHandler {
    lazy var meeting = MeetingController(owner: self)
    lazy var qtiPlot = QtiPlotBridge(owner: self)
    let meetingHotKey = MeetingHotKey()
    var meetingHotKeyStatus: OSStatus = noErr
    var window: NSWindow!
    var workspaceWindow: NSWindow?
    var workspaceWeb: WKWebView?
    var workspaceEntering = false
    var web: WKWebView!
    var statusItem: NSStatusItem!
    var statusLine = NSTextField(labelWithString: "로그인 후 알림을 연결합니다")
    var addressLine = NSTextField(labelWithString: Lab.home.absoluteString)
    var timer: Timer?
    var updating = false
    var updateItems: [NSMenuItem] = []
    var polling = false
    var paused = false
    var generation = 0
    var account = ""
    var recent: [LabNotice] = []
    var pendingTarget: URL?
    var popups: [NSWindow] = []
    let redirectDelegate = NoRedirect()
    lazy var session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil
        c.httpShouldSetCookies = false
        c.urlCache = nil
        c.timeoutIntervalForRequest = 20
        return URLSession(configuration: c, delegate: redirectDelegate, delegateQueue: nil)
    }()
    let center = UNUserNotificationCenter.current()

    func applicationDidFinishLaunching(_ notification: Notification) {
#if MEETING_PREVIEW
        NSApp.setActivationPolicy(.regular)
        meeting.model.topics=[FloatingMeeting(id:"a",title:"온도감응 수중 접착제 연구"),FloatingMeeting(id:"b",title:"형상기억 광결정 힌지"),FloatingMeeting(id:"c",title:"하이드로젤 접착 소재"),FloatingMeeting(id:"__unclassified__",title:"미분류")]
        meeting.model.selected="a";meeting.model.elapsed="12:34"
        meeting.model.action={ [weak self] action,topic in
            guard let self else{return}
            if action == "topic", let topic { self.meeting.model.selected=topic;self.meeting.model.expanded=false }
            if action == "pause" { self.meeting.model.paused.toggle() }
            self.meeting.resize()
        }
        meeting.show()
#else
        NSApp.setActivationPolicy(.regular)
        center.delegate = self
        makeMenu()
        meetingHotKey.onToggle = { [weak self] in self?.toggleMeetingRecording() }
        meetingHotKeyStatus = meetingHotKey.register()
        makeWindow()
        showDashboard()
        if meetingHotKeyStatus != noErr { alert("녹음 단축키 등록 실패", "⌃⌥⌘R을 등록하지 못했습니다. 다른 앱에서 같은 단축키를 쓰는지 확인해주세요. 플로팅 바 버튼은 계속 사용할 수 있습니다.") }
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in Task { @MainActor in await self?.poll() } }
        timer?.tolerance = 10
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(woke), name: NSWorkspace.didWakeNotification, object: nil)
        if !UserDefaults.standard.bool(forKey: "askedNotifications") {
            UserDefaults.standard.set(true, forKey: "askedNotifications")
            Task { await requestNotifications(test: false) }
        }
#endif
    }
    func makeMenu() {
        let main = NSMenu(); let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "NISML Hub 종료", action: #selector(quit), keyEquivalent: "q").target = self
        appItem.submenu = appMenu
        let fileItem = NSMenuItem(title: "파일", action: nil, keyEquivalent: "")
        let fileMenu = NSMenu(title: "파일")
        let closeItem = NSMenuItem(title: "창 닫기", action: #selector(closeActiveWindow), keyEquivalent: "w")
        closeItem.keyEquivalentModifierMask = [.command]; closeItem.target = self
        fileMenu.addItem(closeItem); fileItem.submenu = fileMenu; main.addItem(fileItem)
        let edit = NSMenuItem(title: "편집", action: nil, keyEquivalent: ""); let edits = NSMenu()
        for (title, action, key) in [("복사", "copy:", "c"), ("붙여넣기", "paste:", "v"), ("잘라내기", "cut:", "x"), ("전체 선택", "selectAll:", "a"), ("실행 취소", "undo:", "z")] { edits.addItem(withTitle: title, action: Selector(action), keyEquivalent: key) }
        edit.submenu = edits; main.addItem(edit); NSApp.mainMenu = main
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let image = NSImage(contentsOf: Bundle.main.url(forResource: "Logo", withExtension: "png")!)!
        image.size = NSSize(width: 20, height: 20)
        statusItem.button?.image = image
        statusItem.button?.toolTip = "NISML Hub"
        let menu = NSMenu()
        func item(_ title: String, _ action: Selector) -> NSMenuItem { let i = NSMenuItem(title: title, action: action, keyEquivalent: ""); i.target = self; menu.addItem(i); return i }
        _ = item("Hub 열기", #selector(showDashboard))
        // Primary actions and the independent recent-notification history.
        menu.removeAllItems()
        _ = item("홈페이지 열기", #selector(openHomepage))
        _ = item("Hub 열기", #selector(showDashboard))
        _ = item("통합 전체화면 열기", #selector(showWorkspace))
        _ = item("최근 알림 보기", #selector(showRecentNotifications))
        updateItems.append(item("업데이트 확인", #selector(checkForUpdates)))
        _ = item("로그아웃", #selector(logout))
        _ = item("앱 완전종료", #selector(quit))
        statusItem.menu = menu
        let dashboardMenu = NSMenu()
        addCommand(dashboardMenu, "홈페이지 열기", #selector(openHomepage))
        addCommand(dashboardMenu, "Hub 열기", #selector(showDashboard))
        addCommand(dashboardMenu, "새로고침", #selector(reload), key: "r")
        addCommand(dashboardMenu, "브라우저에서 Hub 열기", #selector(openBrowser))
        let fullItem = addCommand(dashboardMenu, "통합 전체화면 열기", #selector(showWorkspace), key: "f")
        fullItem.keyEquivalentModifierMask = [.control, .command]
        let alerts = makeAlertsMenu()
        let settings = makeSettingsMenu()
        for (name, submenu) in [("대시보드", dashboardMenu), ("알림", alerts), ("설정", settings)] {
            let entry = NSMenuItem(title: name, action: nil, keyEquivalent: "")
            entry.submenu = submenu; main.addItem(entry)
        }
    }
    @discardableResult func addCommand(_ menu: NSMenu, _ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self; menu.addItem(item); return item
    }
    func makeAlertsMenu() -> NSMenu {
        let menu = NSMenu(title: "알림")
        addCommand(menu, "지금 알림 확인", #selector(checkNow))
        addCommand(menu, "Mac 알림 허용 · 테스트", #selector(enableNotifications))
        addCommand(menu, "Mac 알림 설정 열기", #selector(notificationSettings))
        return menu
    }
    var loginItems: [NSMenuItem] = []
    func makeSettingsMenu() -> NSMenu {
        let menu = NSMenu(title: "설정")
        let item = addCommand(menu, "Mac 로그인 시 자동 실행", #selector(toggleLogin))
        item.state = SMAppService.mainApp.status == .enabled ? .on : .off
        loginItems.append(item)
        addCommand(menu, "브라우저에서 Hub 열기", #selector(openBrowser))
        updateItems.append(addCommand(menu, "업데이트 확인", #selector(checkForUpdates)))
        return menu
    }
    func iconButton(_ symbol: String, label: String, action: Selector) -> NSButton {
        let button = NSButton(image: NSImage(systemSymbolName: symbol, accessibilityDescription: label)!, target: self, action: action)
        button.isBordered = false; button.imagePosition = .imageOnly
        button.contentTintColor = .secondaryLabelColor
        button.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 16, weight: .regular)
        button.toolTip = label; button.setAccessibilityLabel(label)
        button.widthAnchor.constraint(equalToConstant: 32).isActive = true
        button.heightAnchor.constraint(equalToConstant: 32).isActive = true
        return button
    }
    func iconMenu(_ symbol: String, label: String, menu: NSMenu) -> NSPopUpButton {
        let button = NSPopUpButton(frame: .zero, pullsDown: true)
        let heading = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        heading.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)?.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 16, weight: .regular))
        menu.insertItem(heading, at: 0); button.menu = menu
        button.isBordered = false; button.imagePosition = .imageOnly
        (button.cell as? NSPopUpButtonCell)?.arrowPosition = .noArrow
        button.contentTintColor = .secondaryLabelColor
        button.toolTip = label; button.setAccessibilityLabel(label)
        button.widthAnchor.constraint(equalToConstant: 32).isActive = true
        button.heightAnchor.constraint(equalToConstant: 32).isActive = true
        return button
    }
    func makeWindow() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.add(self, name: "nismlWorkspace")
        config.userContentController.addScriptMessageHandler(meeting, contentWorld: .page, name: "nismlMeeting")
        config.userContentController.addScriptMessageHandler(qtiPlot, contentWorld: .page, name: "nismlQtiPlot")
        // Keep normal WebKit identity; never disguise an embedded browser to bypass OAuth restrictions.
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 840), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.collectionBehavior = [.fullScreenPrimary]
        window.standardWindowButton(.zoomButton)?.target = self
        window.standardWindowButton(.zoomButton)?.action = #selector(showWorkspace)
        window.title = "NISML Hub"; window.minSize = NSSize(width: 720, height: 520)
        window.titleVisibility = .hidden; window.titlebarAppearsTransparent = true
        window.backgroundColor = .windowBackgroundColor
        window.isReleasedWhenClosed = false; window.delegate = self
        window.setFrameAutosaveName("DashboardWindow"); window.center()
        let stack = NSStackView(); stack.orientation = .vertical; stack.spacing = 0
        let toolbar = NSView()
        toolbar.heightAnchor.constraint(equalToConstant: 40).isActive = true
        let actions = NSStackView(views: [
            iconButton("cloud", label: "연구실 NAS 열기", action: #selector(openNAS)),
            iconButton("globe", label: "홈페이지 열기", action: #selector(openHomepage)),
            iconButton("arrow.clockwise", label: "새로고침", action: #selector(reload)),
            iconMenu("bell", label: "알림", menu: makeAlertsMenu()),
            iconMenu("slider.horizontal.3", label: "설정", menu: makeSettingsMenu())
        ])
        actions.orientation = .horizontal; actions.spacing = 6
        addressLine.stringValue = "NISML Hub"
        addressLine.font = .systemFont(ofSize: 13, weight: .semibold)
        addressLine.textColor = .labelColor; addressLine.alignment = .center
        addressLine.lineBreakMode = .byTruncatingMiddle
        for v in [actions, addressLine] { toolbar.addSubview(v); v.translatesAutoresizingMaskIntoConstraints = false }
        NSLayoutConstraint.activate([
            actions.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor, constant: -18),
            actions.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
            addressLine.centerXAnchor.constraint(equalTo: toolbar.centerXAnchor),
            addressLine.centerYAnchor.constraint(equalTo: toolbar.centerYAnchor),
            addressLine.leadingAnchor.constraint(greaterThanOrEqualTo: toolbar.leadingAnchor, constant: 94),
            addressLine.trailingAnchor.constraint(lessThanOrEqualTo: actions.leadingAnchor, constant: -18)
        ])
        statusLine.font = .systemFont(ofSize: 11); statusLine.textColor = .secondaryLabelColor
        statusLine.lineBreakMode = .byTruncatingTail
        // Connection state is rendered inline in the dashboard footer.
        stack.addArrangedSubview(toolbar); stack.addArrangedSubview(web)
        window.contentView = stack
        for v in [toolbar, web!] { v.translatesAutoresizingMaskIntoConstraints = false; v.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
        web.heightAnchor.constraint(greaterThanOrEqualToConstant: 380).isActive = true
        web.load(URLRequest(url: Lab.home))
    }
    @objc func showDashboard() {
        // Restore only the ordinary Hub window, without activating the workspace Space.
        let moveToCurrentSpace = !window.styleMask.contains(.fullScreen)
        if moveToCurrentSpace { window.collectionBehavior.insert(.moveToActiveSpace) }
        NSApp.unhideWithoutActivation()
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        statusItem.button?.title = ""
        if moveToCurrentSpace {
            DispatchQueue.main.async { [weak self] in
                self?.window.collectionBehavior.remove(.moveToActiveSpace)
            }
        }
    }
    @objc func goHome() { guard !recordingProtected() else { return }; web.load(URLRequest(url: Lab.home)); showDashboard() }
    @objc func reload() { guard !recordingProtected() else { return }; web.reload() }
    @objc func openNAS() {
        NSWorkspace.shared.open(URL(string: "https://tsshim.synology.me:3874/#/signin")!)
    }
    @objc func openHomepage() { NSWorkspace.shared.open(URL(string: "https://nisml.ajou.ac.kr/")!) }
    @objc func openBrowser() { NSWorkspace.shared.open(Lab.home) }
    @objc func checkForUpdates() {
        guard !updating else{return};updating=true
        updateItems.forEach { $0.title="업데이트 확인 중…" }
        Task { @MainActor in
            let config=URLSessionConfiguration.ephemeral
            config.httpCookieStorage=nil;config.httpShouldSetCookies=false;config.urlCache=nil
            config.timeoutIntervalForRequest=60;config.timeoutIntervalForResource=300
            let updateSession=URLSession(configuration:config,delegate:redirectDelegate,delegateQueue:nil)
            defer { updateSession.invalidateAndCancel();updating=false;updateItems.forEach { $0.title="업데이트 확인" } }
            do {
                let manifest=URL(string:"/downloads/manifest",relativeTo:Lab.home)!.absoluteURL
                let (data,response)=try await updateSession.data(for:URLRequest(url:manifest,cachePolicy:.reloadIgnoringLocalCacheData))
                guard (response as? HTTPURLResponse)?.statusCode == 200,data.count < 100000 else{throw updateError("버전 정보를 확인하지 못했습니다.")}
                guard let release=try JSONDecoder().decode(DesktopReleases.self,from:data).mac,let url=release.downloadURL else{throw updateError("올바른 Mac 업데이트 정보가 없습니다.")}
                let current=Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "0.0.0"
                guard Lab.isNewer(release.version,than:current) else{alert("최신 버전입니다", "현재 설치된 버전: \(current)");return}
                updateItems.forEach { $0.title="v\(release.version) 다운로드 중…" }
                let (temporary,result)=try await updateSession.download(for:URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData))
                defer { try? FileManager.default.removeItem(at:temporary) }
                guard (result as? HTTPURLResponse)?.statusCode == 200 else{throw updateError("설치 파일을 다운로드하지 못했습니다.")}
                let bytes=try Data(contentsOf:temporary,options:.mappedIfSafe)
                guard release.matches(bytes) else{throw updateError("파일 검증에 실패했습니다. 다시 업데이트를 확인해주세요.")}
                let folder=FileManager.default.urls(for:.downloadsDirectory,in:.userDomainMask)[0]
                try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
                var destination=folder.appendingPathComponent(url.lastPathComponent)
                if FileManager.default.fileExists(atPath:destination.path) {
                    if let existing=try? Data(contentsOf:destination,options:.mappedIfSafe),release.matches(existing) {
                        NSWorkspace.shared.activateFileViewerSelecting([destination]);alert("업데이트 다운로드 완료", "v\(release.version) 설치 파일이 다운로드 폴더에 있습니다. 회의 녹음을 마친 뒤 앱을 완전히 종료하고 교체해주세요.");return
                    }
                    destination=folder.appendingPathComponent("NISML-Dashboard-\(release.version)-\(UUID().uuidString.prefix(8)).dmg")
                }
                try FileManager.default.moveItem(at:temporary,to:destination)
                NSWorkspace.shared.activateFileViewerSelecting([destination])
                alert("업데이트 다운로드 완료", "v\(release.version) 설치 파일을 다운로드 폴더에 저장했습니다. 회의 녹음을 마친 뒤 앱을 완전히 종료하고 교체해주세요.")
            } catch { alert("업데이트 확인 실패",error.localizedDescription+"\n잠시 후 다시 시도하거나 브라우저에서 다운로드해주세요.") }
        }
    }
    func updateError(_ text:String)->NSError { NSError(domain:"NISMLUpdate",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    @objc func toggleMeetingRecording() {
        guard meeting.recording, !meeting.commandPending, !meeting.model.working else { return }
        meeting.command("pause", nil)
    }
    func applicationWillTerminate(_ notification: Notification) { meetingHotKey.unregister() }
    @objc func closeActiveWindow() {
        // Preserve native recording and tray lifetime; use the red close button's path.
        if let active=NSApp.keyWindow, active !== meeting.panel, active.styleMask.contains(.closable) {
            active.performClose(nil)
        } else { window?.performClose(nil) }
    }
    @objc func quit() { NSApp.terminate(nil) }
    @objc func woke() { Task { await poll() } }
    @objc func checkNow() { Task { await poll() } }
    @objc func enableNotifications() { Task { await requestNotifications(test: true) } }
    @objc func notificationSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!) }
    @objc func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() }
            for item in loginItems { item.state = SMAppService.mainApp.status == .enabled ? .on : .off }
            setStatus(SMAppService.mainApp.status == .requiresApproval ? "시스템 설정에서 자동 실행을 허용해주세요" : "자동 실행 설정을 변경했습니다")
        } catch { alert("자동 실행 설정", "앱을 응용 프로그램 폴더로 옮긴 후 다시 시도해주세요.\n" + error.localizedDescription) }
    }
    @objc func showRecentNotifications() {
        Task { @MainActor in
            await poll()
            guard !account.isEmpty else { alert("최근 알림", "대시보드에 로그인해주세요."); return }
            let box = NSAlert(); box.messageText = "최근 알림 5개"
            box.informativeText = "알림 센터에서 지운 항목도 표시됩니다."
            box.addButton(withTitle: "닫기")
            let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 14
            stack.translatesAutoresizingMaskIntoConstraints = false
            let formatter = DateFormatter(); formatter.locale = Locale(identifier: "ko_KR"); formatter.timeZone = TimeZone(identifier: "Asia/Seoul"); formatter.dateFormat = "MM.dd HH:mm"
            for n in recent {
                let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                let date = iso.date(from: n.at) ?? ISO8601DateFormatter().date(from: n.at)
                let label = NSTextField(wrappingLabelWithString: "\(date.map { formatter.string(from: $0) } ?? n.at) · \(n.label)\n\(n.title)")
                label.font = .systemFont(ofSize: 13); label.translatesAutoresizingMaskIntoConstraints = false
                stack.addArrangedSubview(label); label.widthAnchor.constraint(equalToConstant: 400).isActive = true
            }
            if recent.isEmpty { stack.addArrangedSubview(NSTextField(labelWithString: "최근 알림이 없습니다.")) }
            let container = NSView(); container.addSubview(stack)
            NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: container.leadingAnchor),stack.trailingAnchor.constraint(equalTo: container.trailingAnchor),stack.topAnchor.constraint(equalTo: container.topAnchor),stack.bottomAnchor.constraint(equalTo: container.bottomAnchor),stack.widthAnchor.constraint(equalToConstant: 400)])
            container.layoutSubtreeIfNeeded(); container.setFrameSize(stack.fittingSize)
            box.accessoryView = container; NSApp.activate(ignoringOtherApps: true); box.runModal()
        }
    }
    @objc func logout() {
        guard !recordingProtected() else { return }
        workspaceWeb?.stopLoading(); workspaceWindow?.close(); workspaceWeb = nil; workspaceWindow = nil; workspaceEntering = false
        generation += 1; paused = true; account = ""; recent = []
        center.removeAllDeliveredNotifications(); center.removeAllPendingNotificationRequests()
        web.stopLoading()
        WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            guard let self else { return }; self.paused = false; self.web.load(URLRequest(url: Lab.home)); self.setStatus("로그아웃했습니다. 다시 로그인해주세요.")
        }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if sender === window { sender.orderOut(nil); setStatus("창을 닫아도 앱은 메뉴 막대에서 알림을 확인합니다"); return false }; return true
    }
    func recordingProtected() -> Bool {
        guard meeting.recording || meeting.protectsSession else { return false }
        showDashboard(); alert("회의 녹음 보호", "녹음을 종료하고 서버 저장이 끝난 뒤 다시 시도해주세요. 창만 닫으면 녹음은 계속됩니다."); return true
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { recordingProtected() ? .terminateCancel : .terminateNow }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showDashboard(); return false }
    func setStatus(_ text: String) {
        statusLine.stringValue = text; statusItem.button?.toolTip = "NISML · " + text
        guard let url = web?.url, Lab.isSite(url), url.path.hasPrefix("/dashboard"),
              let encoded = try? JSONSerialization.data(withJSONObject: [text]),
              let json = String(data: encoded, encoding: .utf8) else { return }
        web.evaluateJavaScript("(() => { const el = document.getElementById('desktopConnectionStatus'); if (el) el.textContent = ' (' + \(json)[0] + ')'; })()", completionHandler: nil)
    }
    func alert(_ title: String, _ text: String) { let a = NSAlert(); a.messageText = title; a.informativeText = text; a.runModal() }

    func requestNotifications(test: Bool) async {
        do {
            let allowed = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            guard allowed else { setStatus("Mac 알림이 꺼져 있습니다 · 메뉴에서 알림 설정을 열어주세요"); return }
            if test { try await post(id: "nisml-test", title: "NISML 알림 연결", body: "창을 닫아도 앱이 실행 중이면 새 소식을 확인합니다.", target: Lab.home) }
            setStatus("Mac 알림 허용됨 · 로그인 후 1분 간격으로 확인합니다")
            await poll()
        } catch { setStatus("Mac 알림 설정 확인 필요: " + error.localizedDescription) }
    }
    func post(id: String, title: String, body: String, target: URL) async throws {
        let c = UNMutableNotificationContent(); c.title = title; c.body = body; c.sound = .default
        c.userInfo = ["url": target.absoluteString, "account": Lab.accountKey(account)]
        try await center.add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }
    func poll() async {
        guard !polling && !paused else { return }
        guard let page = web.url, Lab.isSite(page), page.path.hasPrefix("/dashboard") else { setStatus("대시보드에 로그인해주세요 · 알림 연결 대기 중"); return }
        polling = true; defer { polling = false }
        let stamp = generation
        do {
            // Native networking keeps polling when the WebKit window is hidden.
            // Only this app's WebKit cookies are used, scoped to the dashboard origin.
            let cookies = await web.configuration.websiteDataStore.httpCookieStore.allCookies()
            let url = URL(string: "api/data", relativeTo: Lab.home)!.absoluteURL
            var request = URLRequest(url: url); request.cachePolicy = .reloadIgnoringLocalCacheData
            for (key, value) in HTTPCookie.requestHeaderFields(with: Lab.matchingCookies(cookies, url: url)) { request.setValue(value, forHTTPHeaderField: key) }
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await session.data(for: request)
            guard stamp == generation, !paused else { return }
            guard let current = web.url, Lab.isSite(current), current.path.hasPrefix("/dashboard") else { return }
            guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            if http.statusCode == 401 || http.statusCode == 403 || (300...399).contains(http.statusCode) {
                recent = []; account = ""; center.removeAllDeliveredNotifications(); setStatus("로그인이 만료되었거나 접근 권한이 없습니다 · 대시보드를 다시 열어주세요"); return
            }
            guard http.statusCode == 200 else { setStatus("알림 서버 응답 오류 · 다음 확인 때 재시도합니다"); return }
            guard data.count < 2_000_000 else { throw URLError(.dataLengthExceedsMaximum) }
            let feed = try JSONDecoder().decode(NoticeFeed.self, from: data)
            let email = feed.user.email.lowercased()
            guard !email.isEmpty else { setStatus("로그인이 필요합니다"); return }
            if !account.isEmpty && account != email { center.removeAllDeliveredNotifications() }
            account = email
            let historyKey = "recent." + Lab.accountKey(email)
            let cached = UserDefaults.standard.data(forKey: historyKey).flatMap { try? JSONDecoder().decode([LabNotice].self, from: $0) } ?? []
            recent = recentNotices(feed.notifications + cached)
            if let encoded = try? JSONEncoder().encode(recent) { UserDefaults.standard.set(encoded, forKey: historyKey) }
            let key = "seen." + Lab.accountKey(email)
            var ledger = SeenLedger(ids: UserDefaults.standard.stringArray(forKey: key))
            let fresh = ledger.observe(feed.notifications)
            let settings = await center.notificationSettings()
            let allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
            if allowed && !fresh.isEmpty {
                if fresh.count > 4 { try await post(id: "nisml-batch", title: "NISML 새 소식 \(fresh.count)건", body: "연구실 새 알림이 있습니다. 대시보드에서 확인해주세요.", target: URL(string: "?inbox=1", relativeTo: Lab.home)!.absoluteURL) }
                else { for n in fresh { try await post(id: "nisml-" + n.id, title: n.label, body: n.title, target: Lab.target(type: n.type, title: n.title)) } }
                statusItem.button?.title = " •"
            }
            UserDefaults.standard.set(ledger.ids, forKey: key)
            let time = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .short)
            setStatus(allowed ? "연결됨 · 마지막 확인 \(time) · 1분마다 확인" : "로그인 연결됨 · Mac 알림 허용이 필요합니다")
            if let target = pendingTarget, !meeting.protectsSession { pendingTarget = nil; web.load(URLRequest(url: target)) }
        } catch { setStatus("연결 확인 중 · 네트워크 복구 후 자동으로 재시도합니다") }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound, .list]) }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let identifier = response.notification.request.identifier
        let info = response.notification.request.content.userInfo
        let accountHash = info["account"] as? String
        let target = info["url"] as? String
        Task { @MainActor in
            defer { completionHandler() }
            center.removeDeliveredNotifications(withIdentifiers: [identifier])
            // Leave an already open dashboard and its current editing state untouched.
            guard Lab.shouldRevealOnNotification(windowVisible: self.window.isVisible,
                miniaturized: self.window.isMiniaturized, appHidden: NSApp.isHidden) else { return }
            guard accountHash == Lab.accountKey(self.account), let target, let url = URL(string: target), Lab.isSite(url), url.path.hasPrefix("/dashboard") else { self.showDashboard(); return }
            self.pendingTarget = url; self.showDashboard(); await self.poll()
        }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === web else { return }
        if meeting.recording { _ = try? meeting.stop() }
        meeting.protectsSession=false;meeting.panel?.orderOut(nil)
        alert("대시보드 연결 복구", "화면 연결이 중단되었습니다. 녹음 원본은 이 Mac에 보관됩니다. 다시 로그인한 뒤 회의 녹음 시작을 누르면 중단된 기록을 먼저 복구합니다.")
        web.reload()
    }
    // The ordinary dashboard owns recording; the workspace has its own window and Space.
    @objc func showWorkspace() {
        if workspaceWindow == nil {
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .default()
            config.userContentController.add(self, name: "nismlWorkspace")
            let view = WKWebView(frame: .zero, configuration: config)
            view.navigationDelegate = self; view.uiDelegate = self
            let separate = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            separate.title = "NISML Hub · 통합 화면"
            separate.collectionBehavior = [.fullScreenPrimary]
            separate.minSize = NSSize(width: 960, height: 600)
            separate.isReleasedWhenClosed = false; separate.delegate = self
            separate.contentView = view; separate.center()
            workspaceWindow = separate; workspaceWeb = view
            var url = URLComponents(url: Lab.home, resolvingAgainstBaseURL: false)!
            url.queryItems = [URLQueryItem(name: "hubWorkspace", value: "1")]
            view.load(URLRequest(url: url.url!))
        }
        guard let separate = workspaceWindow else { return }
        if separate.isMiniaturized { separate.deminiaturize(nil) }
        separate.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        if !separate.styleMask.contains(.fullScreen) && !workspaceEntering {
            workspaceEntering = true; separate.toggleFullScreen(nil)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "nismlWorkspace", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, Lab.isDashboard(url),
              let action = message.body as? String else { return }
        if message.webView === web && action == "open" { showWorkspace() }
        else if message.webView === workspaceWeb && action == "main" { showDashboard() }
        else if message.webView === workspaceWeb && action == "fullscreen" && !workspaceEntering {
            workspaceWindow?.toggleFullScreen(nil)
        }
    }
    func publishFullscreenState() {
        // Native full screen on the primary window must not replace its normal dashboard.
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('nisml-fullscreen',{detail:{active:false}}));", completionHandler: nil)
    }
    func windowDidEnterFullScreen(_ notification: Notification) {
        if notification.object as? NSWindow === workspaceWindow { workspaceEntering = false }
    }
    func windowDidExitFullScreen(_ notification: Notification) {
        if notification.object as? NSWindow === workspaceWindow { workspaceEntering = false }
    }
    func windowDidFailToEnterFullScreen(_ window: NSWindow) { workspaceEntering = false }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === web {
            addressLine.stringValue = web.url.map { Lab.isSite($0) ? "NISML Hub" : ($0.host ?? "NISML Hub") } ?? "NISML Hub"
            publishFullscreenState()
            Task { await poll() }
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { setStatus("페이지 연결 실패 · 새로고침을 눌러주세요") } }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url=navigationAction.request.url,Lab.opensExternally(url), navigationAction.targetFrame?.isMainFrame != false {
            NSWorkspace.shared.open(url);decisionHandler(.cancel);return
        }
        if webView === web && navigationAction.targetFrame?.isMainFrame == true && meeting.protectsSession { decisionHandler(.cancel); setStatus("녹음 저장 후 페이지를 이동할 수 있습니다"); return }
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" { decisionHandler(.allow); return }
        guard url.scheme == "https" else { decisionHandler(.cancel); return }
        let host = url.host ?? ""
        if Lab.isSite(url) || Lab.isAuthentication(url) {
            if webView === web && navigationAction.targetFrame?.isMainFrame == true { addressLine.stringValue = Lab.isSite(url) ? "NISML Hub" : host }
            decisionHandler(.allow)
        } else if navigationAction.targetFrame?.isMainFrame == true || navigationAction.targetFrame == nil {
            NSWorkspace.shared.open(url); decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url=navigationAction.request.url else { return nil }
        if Lab.opensExternally(url) { NSWorkspace.shared.open(url); return nil }
        guard url.absoluteString == "about:blank" || Lab.isSite(url) || Lab.isAuthentication(url) else { return nil }
        let popup = WKWebView(frame: .zero, configuration: configuration); popup.navigationDelegate = self; popup.uiDelegate = self
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 740), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        w.title = "NISML · 로그인"; w.contentView = popup; w.isReleasedWhenClosed = false; w.center(); w.makeKeyAndOrderFront(nil); popups.append(w); return popup
    }
    func webViewDidClose(_ webView: WKWebView) { popups.first(where: { $0.contentView === webView })?.close(); Task { await poll() } }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { alert("NISML Hub", message); completionHandler() }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "확인"); a.addButton(withTitle: "취소"); completionHandler(a.runModal() == .alertFirstButtonReturn) }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection; p.canChooseDirectories = parameters.allowsDirectories; completionHandler(p.runModal() == .OK ? p.urls : nil) }
}
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    withExtendedLifetime(delegate) { app.run() }
}
