import AppKit
import Foundation
import SwiftUI
import Darwin

private struct TaskItem: Codable, Identifiable {
    let done: Bool
    let id: String
    let title: String
}

private struct TaskSummary: Codable {
    let completed: Int
    let items: [TaskItem]
    let progressPercent: Int
    let remaining: Int
    let total: Int
}

private struct ReviewItem: Codable, Identifiable {
    let estimatedMinutes: Int
    let knowledgePointId: String
    let overdueDays: Int
    let plannedDate: String
    let projectName: String
    let stageLabel: String
    let title: String
    let urgency: String
    var id: String { knowledgePointId }
}

private struct ReviewSummary: Codable {
    let actionableCount: Int
    let completedToday: Int
    let dueTodayCount: Int
    let items: [ReviewItem]
    let overdueCount: Int
    let progressPercent: Int?
}

private struct IslandContent: Codable {
    let dateKey: String
    let generatedAt: String
    let review: ReviewSummary
    let tasks: TaskSummary
    let version: Int
}

private struct IslandSettings: Codable {
    let enabled: Bool
    let expandOnHover: Bool
    let privacyMode: Bool
}

private struct SnapshotMessage: Codable {
    let content: IslandContent?
    let presentation: String
    let protocolVersion: Int?
    let revision: Int
    let settings: IslandSettings

    enum CodingKeys: String, CodingKey {
        case content, presentation, revision, settings
        case protocolVersion = "protocol"
    }
}

@MainActor
private final class IslandModel: ObservableObject {
    @Published var content: IslandContent?
    @Published var presentation = "hidden"
    @Published var settings = IslandSettings(enabled: true, expandOnHover: true, privacyMode: false)

    func apply(_ message: SnapshotMessage) {
        content = message.content
        presentation = message.presentation
        settings = message.settings
    }
}

private func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write(Data((line + "\n").utf8))
}

private struct ProgressRing: View {
    let progress: Double
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.12), lineWidth: 3)
            Circle()
                .trim(from: 0, to: max(0, min(progress, 1)))
                .stroke(Color(red: 0.55, green: 0.80, blue: 0.75), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

private struct CompactIslandView: View {
    @ObservedObject var model: IslandModel
    var body: some View {
        let tasks = model.content?.tasks
        let review = model.content?.review
        HStack(spacing: 14) {
            ProgressRing(progress: Double(tasks?.progressPercent ?? 0) / 100)
                .frame(width: 21, height: 21)
            VStack(alignment: .leading, spacing: 1) {
                Text("今日任务")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
                Text("\(tasks?.remaining ?? 0) 项待完成")
                    .font(.system(size: 12, weight: .semibold))
            }
            Spacer(minLength: 8)
            Rectangle().fill(.white.opacity(0.12)).frame(width: 1, height: 22)
            VStack(alignment: .trailing, spacing: 1) {
                Text("回顾复习")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
                Text("\(review?.actionableCount ?? 0) 项待复习")
                    .font(.system(size: 12, weight: .semibold))
            }
            Circle()
                .fill((review?.overdueCount ?? 0) > 0 ? Color(red: 0.95, green: 0.58, blue: 0.36) : Color(red: 0.55, green: 0.80, blue: 0.75))
                .frame(width: 7, height: 7)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { emit(["action": "set-expanded", "value": true]) }
    }
}

private struct TaskRow: View {
    let item: TaskItem
    let privacyMode: Bool
    var body: some View {
        Button {
            emit(["action": "set-task-done", "taskId": item.id, "done": !item.done])
        } label: {
            HStack(spacing: 10) {
                Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.done ? Color(red: 0.55, green: 0.80, blue: 0.75) : .white.opacity(0.44))
                Text(privacyMode ? "任务内容已隐藏" : item.title)
                    .lineLimit(1)
                    .foregroundStyle(item.done ? .white.opacity(0.42) : .white.opacity(0.90))
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
        }
        .buttonStyle(.plain)
    }
}

private struct ExpandedIslandView: View {
    @ObservedObject var model: IslandModel
    var body: some View {
        let content = model.content
        VStack(spacing: 0) {
            HStack {
                Text("AURIS · TODAY")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .tracking(1.1)
                    .foregroundStyle(Color(red: 0.55, green: 0.80, blue: 0.75))
                Spacer()
                Button { emit(["action": "dismiss"]) } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .semibold))
                }.buttonStyle(.plain).foregroundStyle(.white.opacity(0.5))
                Button { emit(["action": "set-expanded", "value": false]) } label: {
                    Image(systemName: "chevron.up").font(.system(size: 11, weight: .semibold))
                }.buttonStyle(.plain).foregroundStyle(.white.opacity(0.7))
            }
            .padding(.bottom, 14)

            HStack(alignment: .top, spacing: 22) {
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text("今日任务").font(.system(size: 14, weight: .semibold))
                        Spacer()
                        Text("\(content?.tasks.completed ?? 0)/\(content?.tasks.total ?? 0)")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.48))
                    }
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.10))
                            Capsule()
                                .fill(Color(red: 0.55, green: 0.80, blue: 0.75))
                                .frame(width: geometry.size.width * CGFloat(content?.tasks.progressPercent ?? 0) / 100)
                        }
                    }
                    .frame(height: 4)
                    ForEach(content?.tasks.items ?? []) { item in
                        TaskRow(item: item, privacyMode: model.settings.privacyMode)
                    }
                    if (content?.tasks.items.isEmpty ?? true) {
                        Text("今天还没有任务").font(.system(size: 13)).foregroundStyle(.white.opacity(0.42)).padding(.vertical, 16)
                    }
                    Spacer(minLength: 6)
                    Button { emit(["action": "open-home"]) } label: {
                        Label("打开任务页", systemImage: "arrow.up.right")
                    }.buttonStyle(.plain).font(.system(size: 12, weight: .medium)).foregroundStyle(Color(red: 0.55, green: 0.80, blue: 0.75))
                }
                .frame(maxWidth: .infinity, minHeight: 190, alignment: .top)

                Rectangle().fill(.white.opacity(0.10)).frame(width: 1, height: 190)

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("回顾复习").font(.system(size: 14, weight: .semibold))
                        Spacer()
                        Text("\(content?.review.actionableCount ?? 0) 待处理")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.48))
                    }
                    if let review = content?.review.items.first {
                        Text(review.urgency == "overdue" ? "逾期 \(review.overdueDays) 天" : "今天")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(review.urgency == "overdue" ? Color(red: 0.95, green: 0.58, blue: 0.36) : Color(red: 0.55, green: 0.80, blue: 0.75))
                        Text(model.settings.privacyMode ? "复习内容已隐藏" : review.title)
                            .font(.system(size: 16, weight: .semibold)).lineLimit(2)
                        if !model.settings.privacyMode {
                            Text("\(review.projectName) · \(review.stageLabel) · 约 \(review.estimatedMinutes) 分钟")
                                .font(.system(size: 11)).foregroundStyle(.white.opacity(0.46)).lineLimit(2)
                        }
                    } else {
                        Text("今天的回顾已清空").font(.system(size: 13)).foregroundStyle(.white.opacity(0.42)).padding(.vertical, 16)
                    }
                    Spacer(minLength: 6)
                    Button { emit(["action": "open-review"]) } label: {
                        HStack { Spacer(); Text("开始复习"); Image(systemName: "arrow.right"); Spacer() }
                            .padding(.vertical, 9)
                            .background(Color(red: 0.55, green: 0.80, blue: 0.75).opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color(red: 0.62, green: 0.88, blue: 0.82))
                    .disabled(content?.review.items.isEmpty ?? true)
                }
                .frame(maxWidth: .infinity, minHeight: 190, alignment: .top)
            }
            HStack(spacing: 6) {
                Circle().fill(Color(red: 0.55, green: 0.80, blue: 0.75)).frame(width: 5, height: 5)
                Text("数据已同步至 Auris")
                Spacer()
                Text(content?.dateKey ?? "")
            }
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(.white.opacity(0.36))
            .padding(.top, 10)
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 20)
        .foregroundStyle(.white)
    }
}

private struct IslandRootView: View {
    @ObservedObject var model: IslandModel
    var body: some View {
        Group {
            if model.presentation == "expanded" {
                ExpandedIslandView(model: model)
            } else {
                CompactIslandView(model: model)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: model.presentation == "expanded" ? 28 : 19, style: .continuous)
                .fill(Color.black.opacity(0.96))
                .overlay(RoundedRectangle(cornerRadius: model.presentation == "expanded" ? 28 : 19, style: .continuous).stroke(.white.opacity(0.08), lineWidth: 1))
                .shadow(color: .black.opacity(0.38), radius: 24, y: 10)
        )
        .padding(1)
        .onHover { hovering in emit(["action": "hovered", "value": hovering]) }
    }
}

@MainActor
private final class IslandController {
    let model = IslandModel()
    let panel: NSPanel

    init() {
        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 430, height: 40),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 2)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.isReleasedWhenClosed = false
        panel.contentView = NSHostingView(rootView: IslandRootView(model: model))
    }

    func apply(_ message: SnapshotMessage) {
        model.apply(message)
        guard message.presentation != "hidden" else {
            panel.orderOut(nil)
            return
        }
        let size = message.presentation == "expanded"
            ? NSSize(width: 560, height: 310)
            : NSSize(width: 430, height: 40)
        position(size: size)
        panel.orderFrontRegardless()
    }

    func position(size: NSSize) {
        let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens.first
        guard let screen else { return }
        let hasNotch = screen.safeAreaInsets.top > 0
        let top = hasNotch ? screen.frame.maxY : screen.visibleFrame.maxY - 8
        let origin = NSPoint(x: screen.frame.midX - size.width / 2, y: top - size.height)
        panel.setFrame(NSRect(origin: origin, size: size), display: true, animate: panel.isVisible)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: IslandController?
    private var parentPid: pid_t = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        controller = IslandController()
        if CommandLine.arguments.count > 1 { parentPid = pid_t(CommandLine.arguments[1]) ?? 0 }
        emit(["type": "ready", "protocol": 1])
        readInput()
        monitorParent()
    }

    private func readInput() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            while let line = readLine() {
                guard let data = line.data(using: .utf8),
                      let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let type = envelope["type"] as? String else { continue }
                if type == "shutdown" {
                    DispatchQueue.main.async { NSApp.terminate(nil) }
                    return
                }
                guard type == "snapshot", let message = try? JSONDecoder().decode(SnapshotMessage.self, from: data) else { continue }
                DispatchQueue.main.async { self?.controller?.apply(message) }
            }
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    private func monitorParent() {
        guard parentPid > 1 else { return }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while true {
                Thread.sleep(forTimeInterval: 2)
                guard let self else { return }
                if kill(self.parentPid, 0) != 0 {
                    DispatchQueue.main.async { NSApp.terminate(nil) }
                    return
                }
            }
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
