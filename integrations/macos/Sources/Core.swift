import Foundation
import CryptoKit

enum Lab {
    static func shouldRevealOnNotification(windowVisible: Bool, miniaturized: Bool, appHidden: Bool) -> Bool {
        !windowVisible || miniaturized || appHidden
    }
    static let home = URL(string: "https://nisml.tsshim.chatgpt.site/dashboard/")!
    static func isSite(_ url: URL) -> Bool { url.scheme == "https" && [home.host, "nisml.ajou.ac.kr"].contains(url.host) && (url.port == nil || url.port == 443) }
    static func isAuthentication(_ url: URL) -> Bool {
        url.scheme == "https" && (url.port == nil || url.port == 443) && ["auth.openai.com", "auth0.openai.com", "chatgpt.com", "accounts.google.com", "appleid.apple.com", "login.microsoftonline.com"].contains(url.host ?? "")
    }
    static func opensExternally(_ url: URL) -> Bool {
        guard ["https", "http"].contains(url.scheme ?? ""), url.host != nil, url.user == nil, url.password == nil else { return false }
        return isInstaller(url) || (!isSite(url) && !isAuthentication(url))
    }
    static func isInstaller(_ url: URL) -> Bool {
        guard isSite(url) else { return false }
        return ["/downloads/mac", "/downloads/pc", "/downloads/android"].contains(url.path) || (url.path.hasPrefix("/app-releases/") && ["dmg", "pkg", "exe", "msi", "apk"].contains(url.pathExtension.lowercased()))
    }
    static func versionParts(_ text:String) -> [Int]? {
        let parts=text.split(separator:".",omittingEmptySubsequences:false)
        guard parts.count == 3,parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy({ $0.isASCII && $0.isNumber }) }) else{return nil}
        let numbers=parts.compactMap { Int($0) };return numbers.count == 3 ? numbers : nil
    }
    static func isNewer(_ candidate:String,than current:String) -> Bool {
        guard let a=versionParts(candidate),let b=versionParts(current) else{return false}
        return b.lexicographicallyPrecedes(a)
    }
    static func isDashboard(_ url: URL) -> Bool { isSite(url) && (url.path == "/dashboard" || url.path.hasPrefix("/dashboard/")) }
    static func target(type: String, title: String) -> URL {
        var c = URLComponents(url: home, resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "view", value: ["papers", "conferences", "meetingInfo", "groupMeetings"].contains(type) ? type : "papers"), URLQueryItem(name: "q", value: String(title.prefix(500)))]
        return c.url!
    }
    static func accountKey(_ email: String) -> String { SHA256.hash(data: Data(email.lowercased().utf8)).map { String(format: "%02x", $0) }.joined() }
    static func matchingCookies(_ cookies: [HTTPCookie], url: URL) -> [HTTPCookie] {
        guard isSite(url) else { return [] }
        return cookies.filter { c in
            let host = url.host!, d = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
            let domainOK = host == d || (c.domain.hasPrefix(".") && host.hasSuffix("." + d))
            let pathOK = url.path == c.path || url.path.hasPrefix(c.path.hasSuffix("/") ? c.path : c.path + "/")
            return domainOK && pathOK && (c.expiresDate == nil || c.expiresDate! > Date())
        }
    }
}
struct LabNotice: Codable {
    let id: String
    let type: String
    let title: String
    let label: String
    let at: String
}
struct NoticeFeed: Decodable {
    struct Identity: Decodable { let email: String }
    let user: Identity
    let notifications: [LabNotice]
}
struct SeenLedger {
    private(set) var ids: [String]?
    init(ids: [String]?) { self.ids = ids }
    mutating func observe(_ rows: [LabNotice]) -> [LabNotice] {
        let old = ids.map(Set.init)
        let fresh = rows.filter { !(old?.contains($0.id) ?? true) }
        ids = Array(NSOrderedSet(array: (ids ?? []) + rows.map(\.id)).array.compactMap { $0 as? String }.suffix(600))
        return fresh.reversed()
    }
}

func recentNotices(_ rows: [LabNotice]) -> [LabNotice] {
    var seen = Set<String>()
    return Array(rows.sorted { $0.at > $1.at }.filter { seen.insert($0.id).inserted }.prefix(5))
}

struct MacRelease: Decodable {
    let version:String
    let file:String
    let size:Int
    let sha256:String
    var downloadURL:URL? {
        guard Lab.versionParts(version) != nil,file == "/app-releases/NISML-Dashboard-\(version)-arm64.dmg",size > 0,size <= 64*1024*1024,sha256.count == 64,sha256.allSatisfy({ $0.isASCII && $0.isHexDigit }) else{return nil}
        return URL(string:file,relativeTo:Lab.home)?.absoluteURL
    }
    func matches(_ data:Data) -> Bool { data.count == size && SHA256.hash(data:data).map { String(format:"%02x",$0) }.joined() == sha256.lowercased() }
}
struct DesktopReleases:Decodable { let mac:MacRelease? }
