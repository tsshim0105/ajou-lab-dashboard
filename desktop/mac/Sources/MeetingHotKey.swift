import AppKit
import Carbon

// Register one specific global shortcut; no keyboard monitoring or accessibility access.
@MainActor final class MeetingHotKey {
    static let signature: OSType = 0x4e49534d
    static let identifier: UInt32 = 1
    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private var held = false
    var onToggle: () -> Void = {}

    func register() -> OSStatus {
        guard hotKey == nil else { return noErr }
        var events = [
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased))
        ]
        let installed = InstallEventHandler(GetApplicationEventTarget(), { _, event, context in
            guard let event, let context else { return OSStatus(eventNotHandledErr) }
            var id = EventHotKeyID()
            let result = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            guard result == noErr, id.signature == 0x4e49534d, id.id == 1 else { return OSStatus(eventNotHandledErr) }
            let pressed = GetEventKind(event) == UInt32(kEventHotKeyPressed)
            MainActor.assumeIsolated {
                Unmanaged<MeetingHotKey>.fromOpaque(context).takeUnretainedValue().receive(pressed: pressed)
            }
            return noErr
        }, events.count, &events, Unmanaged.passUnretained(self).toOpaque(), &handler)
        guard installed == noErr else { return installed }
        let result = RegisterEventHotKey(UInt32(kVK_ANSI_R), UInt32(controlKey | optionKey | cmdKey), EventHotKeyID(signature: Self.signature, id: Self.identifier), GetApplicationEventTarget(), 0, &hotKey)
        if result != noErr { if let handler { RemoveEventHandler(handler) };handler=nil }
        return result
    }
    private func receive(pressed: Bool) {
        if !pressed { held=false;return }
        guard !held else { return };held=true
        onToggle()
    }
    func unregister() {
        if let hotKey { UnregisterEventHotKey(hotKey) };hotKey=nil
        if let handler { RemoveEventHandler(handler) };handler=nil;held=false
    }
}
