import Foundation
import CryptoKit

enum Lab {
    static func shouldRevealOnNotification(windowVisible: Bool, miniaturized: Bool, appHidden: Bool) -> Bool {
        !windowVisible || miniaturized || appHidden
    }
    static let home = URL(string: "https://nisml.tsshim.chatgpt.site/dashboard/")!
    static func isSite(_ url: URL) -> Bool { url.scheme == "https" && [home.host, "nisml.ajou.ac.kr"].contains(url.host) && (url.port == nil || url.port == 443) }
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
