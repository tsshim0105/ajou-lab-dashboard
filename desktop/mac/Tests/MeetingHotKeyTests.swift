import AppKit
import Carbon
@main struct HotKeyTests {
 @MainActor static func main() {
  _ = NSApplication.shared
  let hotkey=MeetingHotKey();var toggles=0;hotkey.onToggle={toggles+=1}
  let result=hotkey.register();precondition(result == noErr,"Global registration failed: \(result)");defer{hotkey.unregister()}
  func send(_ kind:UInt32,_ identifier:UInt32=1){
   var event:EventRef?;precondition(CreateEvent(nil,OSType(kEventClassKeyboard),kind,0,0,&event)==noErr)
   var id=EventHotKeyID(signature:0x4e49534d,id:identifier)
   precondition(SetEventParameter(event,EventParamName(kEventParamDirectObject),EventParamType(typeEventHotKeyID),MemoryLayout<EventHotKeyID>.size,&id)==noErr)
   _=SendEventToEventTarget(event,GetApplicationEventTarget());ReleaseEvent(event)
  }
  send(UInt32(kEventHotKeyPressed));precondition(toggles==1)
  send(UInt32(kEventHotKeyPressed));precondition(toggles==1,"Held key must not toggle repeatedly")
  send(UInt32(kEventHotKeyReleased));send(UInt32(kEventHotKeyPressed));precondition(toggles==2)
  send(UInt32(kEventHotKeyReleased));send(UInt32(kEventHotKeyPressed),99);precondition(toggles==2)
  hotkey.unregister();precondition(hotkey.register()==noErr)
  print("PASS: global shortcut registration, key dispatch, repeat suppression, identifier isolation and re-registration")
 }
}
