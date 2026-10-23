import AppKit
import WebKit
@MainActor final class AppDelegate { var web: WKWebView?;func showDashboard(){} }
MainActor.assumeIsolated {
let app=NSApplication.shared
let owner=AppDelegate(),controller=MeetingController(owner:owner)
controller.model.topics=(0..<12).map{FloatingMeeting(id:String($0),title:"연구 \($0)",quick:$0<7)}
controller.model.readyToStart=true
controller.show()
let anchor=controller.panel!.frame.origin
for _ in 0..<100 {
 controller.model.expanded=true;controller.resize()
 controller.model.otherExpanded=true;controller.resize()
 controller.model.otherExpanded=false;controller.model.expanded=false;controller.resize()
 precondition(controller.panel!.frame.origin==anchor,"panel drift")
}
print("PASS: 100 expand/collapse cycles preserve panel origin")
controller.panel?.orderOut(nil)

}
