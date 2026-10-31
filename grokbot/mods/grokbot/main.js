// Grok Bot look-alike (x.ai/bot): agents are Bots you message like teammates.
// props.role: "sidebar" | "header" | "composer" | "activity" | "new" | "rename-machine".

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { agents, spaces, panes, focused, run, hc, home, openOverlay, setAgentOrder, props, machines, knownAgents, closeOverlay, window, shared, setShared, layout, settings } from "herdr";
import { machineGroups, machineName as defaultMachineName, machineStatus, launchCommand } from "./machine-model.js";

const C = {
  ink: "#0b0b0e",
  page: "#101014",
  card: "#16161a",
  raised: "#1f1f25",
  line: "#24242b",
  edge: "#34343c",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  dim: "#71717a",
  white: "#ffffff",
};
// The bot avatar colors from x.ai/bot.
const PALETTE = ["#ED712E", "#EB4699", "#885CF5", "#54B9A6", "#3C82F6", "#5BC67A", "#F19D38", "#EA4045"];
const STATUS = {
  working: { color: "#54b9a6", label: "Working", verb: "is working on" },
  blocked: { color: "#f19d38", label: "Needs your approval", verb: "needs your approval in" },
  done: { color: "#3c82f6", label: "Finished, ready for review", verb: "finished" },
  idle: { color: "#71717a", label: "Ready for a task", verb: "is standing by in" },
};
const st = (s) => STATUS[s] ?? STATUS.idle;

function hash(text) {
  let h = 0;
  for (const ch of text ?? "") h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const colorOf = (a) => PALETTE[hash(a?.address) % PALETTE.length];
// Unnamed tabs are called by their number, which makes a poor teammate name.
const nameOf = (a) => {
  const tab = spaces().flatMap((s) => s.tabs).find((t) => t.id === a.tab);
  return !tab?.named && /^\d+$/.test(a.tab_name) ? `${a.program?.name ?? "Bot"} ${a.tab_name}` : a.tab_name;
};
// The pane id is how a Bot's terminal is addressed (pane.focus, hc send), and two Bots can
// share a tab name: show it after the name, "name: pane".
const paneTag = (a) => String(a?.pane ?? a?.address ?? "");
// The terminal address (t14) is the one short, usable handle: commands and hc send take it,
// while tab and pane ids are 32 hex chars. Full ids stay in the tooltip.
const fullId = (a) => `app ${a?.program?.name ?? "?"} · terminal ${a?.address ?? "?"} · tab ${a?.tab ?? "?"} · pane ${paneTag(a)}`;
// A remote address is "machine/t14": the list is flat, so the row says where the Bot lives.
const addrLabel = (a) => String(a?.address ?? "").split("/").pop();
const placeLabel = (a) => {
  const sp = spaces().find((s) => s.id === a?.space);
  return [machineName(sp ? sp.machine : null), sp?.name ?? a?.space_name, addrLabel(a)]
    .filter((part) => Boolean(part)).join("/");
};
const monoFont = () => String(settings().font ?? "Geist Mono");

// Every list in the sidebar is a tree. One shared map remembers what is closed, so the
// shape survives restarts (shared state is written only on click, never on render).
const FOLD_KEY = "grokbot.folded";
const folds = () => shared(FOLD_KEY) ?? {};
const folded = (key) => Boolean(folds()[key]);
function toggleFold(key) {
  const next = { ...folds() };
  if (next[key]) delete next[key];
  else next[key] = true;
  setShared(FOLD_KEY, next);
}
// The twisty is its own hit target, so the row's action (open workspace, rename) still works.
const twisty = (key, size = 8) => own(div())
  .id(`gb-twisty-${key}`)
  .flex_none()
  .w(size + 4)
  .text_size(size)
  .text_color(C.dim)
  .cursor_pointer()
  .hover((s) => s.text_color(C.text))
  .tooltip(folded(key) ? "Expand" : "Collapse")
  .accessibility_label(folded(key) ? "Expand" : "Collapse")
  .on_click((_e, cx) => { cx.stop_propagation(); toggleFold(key); })
  .child(folded(key) ? "▸" : "▾");

function folder(cwd, machine = null) {
  if (!cwd) return "";
  if (machine != null) return cwd;
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// The Bot this thread belongs to: the focused agent, else the shown tab's.
function current() {
  const f = focused();
  const all = agents();
  return all.find((a) => a.address === (f?.shown ?? f?.terminal ?? f?.agent)) ?? all.find((a) => a.tab === f?.tab) ?? null;
}

// "+ New Bot" asks which workspace first — but only when there is a choice to make.
function askNew() {
  const all = spaces();
  const active = all.find((s) => s.active) ?? all[0];
  if (!active || all.length < 2) return openNew(active?.machine ?? null, active?.id ?? null);
  openOverlay({ mod: "grokbot", kind: "popup", width: 320, height: 460,
    props: { role: "pick-space", machine: active.machine } });
}

function openNew(machine, space = null) {
  openOverlay({ mod: "grokbot", kind: "popup", width: 300, height: 460,
    props: { role: "new", machine, space } });
}

// Display names belong to this layout; connection names remain opaque routing ids.
const machineKey = (name) => `grokbot.machine-name.${JSON.stringify(name ?? null)}`;
const machineName = (name) => shared(machineKey(name)) || defaultMachineName(name);

function renameMachine(name) {
  openOverlay({ mod: "grokbot", kind: "dialog", width: 420,
    props: { role: "rename-machine", machine: name } });
}

function machineGlyph(size = 14) {
  return svg("mods/grokbot/machine.svg").size(size).flex_none();
}

function avatar(a, size = 34) {
  const g = a?.program;
  return div()
    .relative()
    .flex_none()
    .size(size)
    .rounded_full()
    .bg(a ? colorOf(a) : C.raised)
    .flex()
    .items_center()
    .justify_center()
    .text_color(C.white)
    .text_size(size * 0.42)
    .font_semibold()
    .when(Boolean(g?.icon && g.tint), (el) => el.child(svg(g.icon).size(size * 0.5).text_color(C.white)))
    .when(Boolean(g?.icon && !g.tint), (el) => el.child(image(g.icon).size(size * 0.5)))
    .when(!g?.icon, (el) => el.child(a ? nameOf(a).slice(0, 1).toUpperCase() : "+"));
}

function statusDot(status, size = 8) {
  const dot = div().flex_none().size(size).rounded_full().bg(st(status).color);
  return status === "working" ? dot.loop("opacity", { from: 0.35, to: 1, period: 1200 }) : dot;
}

// Short enough to sit at the end of the name line.
const SHORT_STATUS = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };
function statusShort(status) {
  const s = st(status);
  const text = div().flex_none().text_size(10).text_color(status === "idle" ? C.dim : s.color);
  return status === "working" ? text.frames(["Working", "Working.", "Working..", "Working..."], 420) : text.child(SHORT_STATUS[status] ?? s.label);
}

// A press on a control inside a window_drag block is the control's, not the window's.
const own = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

// Target the clicked tab, even when it belongs to an inactive workspace.
function renameTab(id) {
  const tab = spaces().flatMap((s) => s.tabs).find((t) => t.id === id);
  if (!tab) return;
  openOverlay({
    mod: "prompt",
    kind: "dialog",
    width: 420,
    props: {
      title: "Rename agent and tab",
      value: tab.named ? tab.name : "",
      hint: "Agents in this tab share its name. Leave blank for the automatic name.",
      command: { name: "tab.rename", args: { id } },
    },
  });
}

function renameButton(id, tab) {
  return own(div()).id(id).flex_none().size(24).rounded(6)
    .flex().items_center().justify_center().text_color(C.dim)
    .hover((s) => s.bg(C.raised).text_color(C.text)).cursor_pointer()
    .tooltip("Rename agent and tab").accessibility_label("Rename agent and tab")
    .on_click((_event, cx) => { cx.stop_propagation(); renameTab(tab); })
    .child(svg("mods/grokbot/rename.svg").size(14));
}

function pill(id, label, onClick, solid = false) {
  return own(h_flex())
    .id(id)
    .flex_none()
    .h(32)
    .px(14)
    .gap(6)
    .items_center()
    .justify_center()
    .rounded_full()
    .cursor_pointer()
    .text_size(13)
    .font_semibold()
    .when(solid, (el) => el.bg(C.text).text_color(C.ink).hover((s) => s.bg(C.white)))
    .when(!solid, (el) => el.border_1().border_color(C.edge).text_color(C.text).hover((s) => s.bg("#ffffff0d")))
    .on_click(onClick)
    .child(label);
}

const section = (id, text, extra = "", key = null) =>
  own(h_flex())
    .id(`gb-section-${id}`)
    .px(12)
    .mt(20)
    .mb(6)
    .h(22)
    .gap(4)
    .rounded(6)
    .items_center()
    .text_size(11)
    .font_semibold()
    .text_color(C.dim)
    .when(Boolean(key), (el) => el.cursor_pointer().hover((s) => s.bg("#ffffff08")).on_click(() => toggleFold(key)))
    .when(Boolean(key), (el) => el.child(twisty(key)))
    .when(!key, (el) => el.pl(8))
    .child(div().flex_1().child(text))
    .child(div().child(extra));

export default class GrokBot extends View {
  init(_props, cx) {
    this.log = [];
    this.last = new Map();
    this.input = InputState.new({ placeholder: "Message your Bot…" });
    this.input.on("submit", (_e, cx) => this.send(cx));
    this.input.on("change", (_e, cx) => {
      const has = Boolean(this.input.value().trim());
      if (has !== this.hasText) { this.hasText = has; cx.notify(); }
    });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    if (props()?.role === "new") {
      this.launcherTarget = { machine: props().machine ?? null, space: props().space ?? null };
      this.launcherAgents = [];
      this.launcherLoading = true;
      this.launcherFocus = cx.focus_handle();
      this.launcherFocus.focus();
      cx.spawn(async (cx) => {
        try {
          launchCommand(this.launcherTarget, spaces(), machines());
          this.launcherAgents = await knownAgents({ on: this.launcherTarget.machine });
        } catch (error) { this.launcherError = String(error.message ?? error); }
        this.launcherLoading = false;
        cx.notify();
      });
    }
    if (props()?.role === "pick-space") {
      this.pickList = [];
      this.pickFocus = cx.focus_handle();
      this.pickFocus.focus();
    }
    if (props()?.role === "rename-machine") {
      this.machineInput = InputState.new({ value: shared(machineKey(props().machine)) || "" });
      const length = this.machineInput.value().length;
      this.machineInput.set_selected_range({ start: 0, end: length });
      this.machineInput.on("submit", () => this.saveMachineName());
      this.machineInput.focus();
      this.machineFocus = cx.focus_handle();
    }
    // Only the activity feed shows relative times; nothing else needs a clock.
    if (props()?.role === "activity") cx.timer.every(30000, (cx) => cx.notify());
  }

  send(cx) {
    const text = this.input.value().trim();
    const to = current()?.address ?? focused()?.terminal;
    if (!text || !to) return;
    this.input.set_value("");
    cx.spawn(async () => { await hc(["send", to, text]); });
  }

  sidebar() {
    const all = agents();
    const groups = machineGroups(machines(), spaces(), all);
    // A Bot belongs to the workspace it works in, so the list groups them that way.
    const spaceGroups = groups
      .map(m => ({
        machine: m,
        spaces: [
          ...m.spaces.map(s => ({ space: s, bots: m.agents.filter(a => a.space === s.id) })),
          // An agent whose space is gone still needs somewhere to show up.
          ...(m.agents.some(a => !m.spaces.some(s => s.id === a.space))
            ? [{ space: null, bots: m.agents.filter(a => !m.spaces.some(s => s.id === a.space)) }]
            : []),
        ].filter(g => g.bots.length > 0),
      }))
      .filter(m => m.spaces.length > 0);
    setAgentOrder(spaceGroups.flatMap(m => m.spaces.flatMap(g => g.bots.map(a => a.address))));
    const f = focused();
    const space = spaces().find((s) => s.active);
    const threads = space?.tabs ?? [];
    const waiting = all.filter((a) => a.status === "blocked").length;
    const host = groups.find(m => m.name === (space?.machine ?? null));

    // MACHINES: a machine opens to its workspaces.
    const machineRow = (m) => {
      const key = `m:${m.name ?? "here"}`;
      const tag = m.name == null ? "here" : `remote-${m.name}`;
      return v_flex()
        .child(own(h_flex()).id(`gb-machine-${tag}`).mx(10).px(6).py(7).gap(6).items_center().rounded(8)
          .text_color(space && space.machine === m.name ? C.text : C.muted)
          .hover(s => s.bg("#ffffff0a")).cursor_pointer()
          .on_click(() => {
            const workspace = m.spaces.find(s => s.active) ?? m.spaces[0];
            if (workspace) run("space.select", { id: workspace.id });
            else openNew(m.name);
          })
          .child(twisty(key))
          .child(machineGlyph())
          .child(v_flex().flex_1().min_w(0).gap(2)
            .child(div().text_size(12).font_semibold().truncate().child(machineName(m.name)))
            .child(div().text_size(10).text_color(m.layout === "unavailable" ? st("blocked").color : C.dim).child(machineStatus(m))))
          .child(own(div()).id(`gb-machine-rename-${tag}`).size(24).flex_none().rounded(6)
            .flex().items_center().justify_center().text_color(C.dim).cursor_pointer()
            .hover(s => s.bg(C.raised).text_color(C.text))
            .tooltip("Rename machine").accessibility_label(`Rename ${machineName(m.name)}`)
            .on_click((_e, cx) => { cx.stop_propagation(); renameMachine(m.name); })
            .child(svg("mods/grokbot/rename.svg").size(14)))
          .child(own(div()).id(`gb-machine-new-${tag}`).size(24).flex_none().rounded(6).flex().items_center().justify_center()
            .text_color(C.dim).when(m.layout === "ready", el => el.cursor_pointer())
            .hover(s => s.bg(C.raised).text_color(m.layout === "ready" ? C.text : C.muted))
            .disabled(m.layout !== "ready").tooltip(`New workspace on ${machineName(m.name)}`).accessibility_label(`New workspace on ${machineName(m.name)}`)
            .on_click((_e, cx) => { cx.stop_propagation(); if (m.layout === "ready") openNew(m.name); }).child("+")))
        .when(!folded(key), (el) => el.children(m.spaces.map(s => own(h_flex()).id(`gb-machine-space-${s.id}`).ml(40).mr(10).px(8).h(28).gap(7).rounded(7).items_center()
          .text_size(11).text_color(s.active ? C.text : C.dim).when(s.active, el => el.bg("#ffffff0c"))
          .hover(state => state.bg("#ffffff08")).cursor_pointer().on_click(() => run("space.select", { id: s.id }))
          .child(div().flex_1().min_w(0).truncate().child(s.name))
          .when(Boolean(s.status), el => el.child(statusDot(s.status, 5))))));
    };

    const bot = (a) =>
      own(h_flex())
        .id(`gb-bot-${a.address}`)
        .mx(10)
        .px(10)
        .py(8)
        .gap(11)
        .items_center()
        .rounded(12)
        .cursor_pointer()
        .when(a.tab === f?.tab, (el) => el.bg("#ffffff12"))
        .hover((s) => s.bg("#ffffff0a"))
        .on_click(() => {
          run("agent.focus", { terminal: a.address });
          if (panes().some(p => p.terminal === a.address)) run("pane.focus", { terminal: a.address });
        })
        .child(avatar(a, 24))
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(2)
            .child(
              h_flex()
                .w_full()
                .min_w(0)
                .gap(8)
                .overflow_hidden()
                .items_center()
                .child(div().flex_1().min_w(0).text_size(13).font_semibold().text_color(C.text).truncate().child(nameOf(a)))
                .child(statusShort(a.status)),
            )
            .child(
              div()
                .min_w(0)
                .text_size(9)
                .text_color(C.dim)
                .font_family(monoFont())
                .whitespace_nowrap()
                .text_ellipsis_middle()
                .tooltip(fullId(a))
                .child(placeLabel(a)),
            ),
        )
        .child(renameButton(`gb-rename-bot-${a.address}`, a.tab));

    // One flat list, ordered machine > workspace > Bot so related Bots stay together.
    const flatBots = spaceGroups.flatMap(m => m.spaces.flatMap(g => g.bots));

    const thread = (t) =>
      own(h_flex())
        .id(`gb-thread-${t.id}`)
        .mx(10)
        .px(10)
        .h(32)
        .gap(10)
        .items_center()
        .rounded(10)
        .cursor_pointer()
        .text_size(13)
        .text_color(t.active ? C.text : C.muted)
        .when(t.active, (el) => el.bg("#ffffff12"))
        .hover((s) => s.bg("#ffffff0a"))
        .on_click(() => run("tab.select", { id: t.id }))
        .child(div().text_color(C.dim).child("#"))
        .child(div().flex_1().truncate().child(t.named ? t.name : `thread ${t.name}`))
        .when(Boolean(t.status), (el) => el.child(statusDot(t.status, 7)))
        .child(renameButton(`gb-rename-thread-${t.id}`, t.id));

    const botsFolded = folded("bots");
    return v_flex()
      .size_full()
      .bg(C.ink)
      .text_color(C.text)
      .overflow_hidden()
      // macOS window buttons sit above this.
      .child(div().h(44).flex_none())
      .child(
        h_flex()
          .px(20)
          .gap(8)
          .items_center()
          .child(div().text_size(20).font_bold().child("Grok"))
          .child(div().text_size(20).text_color(C.muted).child("Bot")),
      )
      .child(
        h_flex()
          .px(20)
          .mt(16)
          .child(
            pill("gb-new", "+  New Bot", () => askNew(), true)
              .flex_1(),
          ),
      )
      .child(
        v_flex()
          .id("gb-lists")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .child(section("bots", "BOTS", waiting ? `${waiting} waiting` : String(all.length), "bots"))
          .when(!botsFolded && all.length === 0, (el) =>
            el.child(div().px(20).py(6).text_size(12).text_color(C.dim).child("No Bots yet. Give one a task.")),
          )
          .when(!botsFolded, (el) => el.children(flatBots.map(bot)))
          .child(section("machines", "MACHINES", String(groups.length), "machines"))
          .when(!folded("machines"), (el) => el.children(groups.map(machineRow)))
          .child(section("threads", "THREADS", String(threads.length), "threads"))
          .when(!folded("threads"), (el) => el.children(threads.map(thread))),
      )
      .child(own(h_flex()).px(10).pt(8).gap(2).items_center()
        .child(own(div()).id("gb-add-machine").flex_1().px(6).py(4).rounded(6).text_size(11).text_color(C.muted).cursor_pointer()
          .hover(s => s.bg(C.raised).text_color(C.text)).on_click(() => run("mod.open", { name: "machine-add" })).child("+ Add machine"))
        .child(own(div()).id("gb-manage-machines").px(6).py(4).rounded(6).text_size(11).text_color(C.dim).cursor_pointer()
          .hover(s => s.bg(C.raised).text_color(C.text)).on_click(() => run("app.settings", { section: "machines" })).child("Manage")))
      .child(
        own(h_flex())
          .id("gb-space")
          .flex_none()
          .m(12)
          .px(12)
          .h(48)
          .gap(10)
          .items_center()
          .rounded(14)
          .bg(C.card)
          .border_1()
          .border_color(C.line)
          .cursor_pointer()
          .hover((s) => s.bg(C.raised))
          .on_click(() => openOverlay({ mod: "picker", kind: "popup", at: "top", offset: 40, width: 640, height: 0.8 }))
          .child(div().size(26).rounded(8).bg(C.raised).flex().items_center().justify_center().text_size(12).child("⌘"))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .child(div().text_size(13).font_semibold().truncate().child(space?.name ?? "Workspace"))
              .child(div().text_size(11).text_color(C.dim).truncate().child(`${machineName(space?.machine)} · ${host?.spaces.length ?? 0} workspace${host?.spaces.length === 1 ? "" : "s"}`)),
          ),
      );
  }

  header() {
    const root = layout();
    const sidebar = root?.children?.find(node => node.id === "sidebar");
    const sidebarHidden = Boolean(sidebar?.hidden);
    const w = window();
    // When the sidebar is hidden, the header sits beneath the macOS window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(22, (root.traffic_lights[0] + 64) / settings().zoom - (sidebarHidden ? 0 : sidebar?.size?.px ?? 0))
      : 22;
    const sidebarLabel = sidebarHidden ? "Show sidebar" : "Hide sidebar";
    const a = current();
    const tab = spaces().find((s) => s.active)?.tabs.find((t) => t.active);
    const pane = panes().find((p) => p.terminal === (focused()?.shown ?? focused()?.terminal)) ?? (a && panes().find((p) => p.terminal === a.address));
    const space = spaces().find(s => s.id === (a?.space ?? focused()?.space));
    const where = [machineName(space?.machine), folder(pane?.cwd, space?.machine), pane?.branch].filter(Boolean).join(" · ");
    return h_flex()
      .size_full()
      .px(22)
      .pl(lightsPadding)
      .gap(12)
      .items_center()
      .border_b(1)
      .border_color(C.line)
      .text_color(C.text)
      .child(own(div()).id("gb-sidebar-toggle").flex_none().size(32).rounded(8)
        .flex().items_center().justify_center().text_color(sidebarHidden ? C.dim : C.text)
        .hover(s => s.bg(C.raised).text_color(C.text)).cursor_pointer()
        .tooltip(sidebarLabel).accessibility_label(sidebarLabel)
        .on_click((_event, cx) => { cx.stop_propagation(); run("layout.toggle", { id: "sidebar" }); })
        .child(svg("mods/grokbot/sidebar.svg").size(18)))
      .child(avatar(a, 36))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(
            h_flex()
              .min_w(0)
              .gap(0)
              .items_baseline()
              .child(div().min_w(0).text_size(15).font_semibold().text_color(C.text).truncate().child(a ? nameOf(a) : tab?.named ? tab.name : "New thread")),
          )
          .child(div().text_size(12).text_color(C.dim).truncate().tooltip(a ? fullId(a) : where)
            .child(a ? `${addrLabel(a)} · ${where}` : where)),
      )
      .when(Boolean(a), (el) =>
        el.child(
          h_flex()
            .flex_none()
            .h(26)
            .px(11)
            .gap(7)
            .items_center()
            .rounded_full()
            .bg(st(a.status).color + "22")
            .child(statusDot(a.status, 7))
            .child(div().text_size(12).font_semibold().text_color(st(a.status).color).child(a.status === "working" ? "Working" : a.status === "blocked" ? "Needs you" : a.status === "done" ? "Done" : "Idle")),
        ),
      )
      .when(Boolean(a?.tab ?? tab?.id), (el) =>
        el.child(pill("gb-rename-current", "Rename", () => renameTab(a?.tab ?? tab?.id))),
      )
      .child(pill("gb-split", "Computer", () => run("pane.split", { direction: "right" })))
      .child(pill("gb-activity", "Activity", () => run("layout.toggle", { id: "activity" })));
  }

  composer() {
    const a = current();
    return v_flex()
      .size_full()
      .px(14)
      .pt(10)
      .pb(14)
      .child(
        h_flex()
          .id("gb-composer")
          .flex_1()
          .pl(18)
          .pr(8)
          .gap(10)
          .items_center()
          .rounded(26)
          .bg(C.card)
          .border_1()
          .border_color(this.typing ? "#52525b" : C.edge)
          .cursor_text()
          .hover(s => s.bg(C.raised))
          .child(own(div()).id("gb-attach").flex_none().size(28).rounded_full().flex().items_center().justify_center()
            .text_size(18).text_color(C.dim).cursor_pointer()
            .hover(s => s.bg(C.card).text_color(C.text))
            .child("+"))
          .child(Input.new(this.input).flex_1().h_full().text_size(14).text_color(C.text))
          .child(
            div()
              .id("gb-send")
              .flex_none()
              .size(38)
              .rounded_full()
              .bg(this.input.value().trim() ? C.text : C.raised)
              .text_color(this.input.value().trim() ? C.ink : C.dim)
              .flex()
              .items_center()
              .justify_center()
              .text_size(17)
              .font_bold()
              .cursor_pointer()
              .hover(s => s.bg(this.input.value().trim() ? C.white : C.raised))
              .on_click((_e, cx) => this.send(cx))
              .child("↑"),
          ),
      )
      .child(
        div()
          .pt(6)
          .text_size(11)
          .text_color(C.dim)
          .text_center()
          .child(a ? `Messages go to ${nameOf(a)} · it comes back when your approval is needed` : "Start a Bot with New Bot, then give it a task"),
      );
  }

  // Status changes become feed entries, like Bots reporting back in a thread.
  record(all) {
    for (const a of all) {
      if (this.last.get(a.address) === a.status) continue;
      this.last.set(a.address, a.status);
      this.log.unshift({ id: `${a.address}-${a.seq}-${a.status}`, agent: a, status: a.status, machine: spaces().find(s => s.id === a.space)?.machine ?? null, at: Date.now() });
    }
    this.log.length = Math.min(this.log.length, 40);
  }

  activity() {
    const all = agents();
    this.record(all);
    const a = current();
    const pane = a && panes().find((p) => p.terminal === a.address);
    const space = spaces().find(s => s.id === a?.space);
    const live = (e) => all.find((x) => x.address === e.agent.address) ?? e.agent;

    const entry = (e) => {
      const who = live(e);
      return h_flex()
        .id(`gb-log-${e.id}`)
        .px(18)
        .py(8)
        .gap(10)
        .items_start()
        .cursor_pointer()
        .hover((s) => s.bg("#ffffff08"))
        .on_click(() => run("agent.focus", { terminal: who.address }))
        .child(avatar(who, 26))
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(2)
            .child(
              div()
                .text_size(13)
                .text_color(C.muted)
                .child(`${nameOf(who)} ${st(e.status).verb}${e.status === "done" ? "" : /^\d+$/.test(who.tab_name) ? " its thread" : " " + who.tab_name}`),
            )
            .child(h_flex().gap(6).items_center().child(statusDot(e.status, 6)).child(div().text_size(11).text_color(C.dim).child(`${machineName(e.machine)} · ${ago(e.at)}`))),
        );
    };

    return v_flex()
      .size_full()
      .bg(C.ink)
      .text_color(C.text)
      .overflow_hidden()
      .child(
        h_flex()
          .h(64)
          .flex_none()
          .px(18)
          .items_center()
          .border_b(1)
          .border_color(C.line)
          .child(div().flex_1().text_size(15).font_semibold().child("Activity"))
          .child(div().text_size(12).text_color(C.dim).child(`${all.filter((x) => x.status === "working").length} working`)),
      )
      .child(
        v_flex()
          .id("gb-log")
          .flex_1()
          .min_h(0)
          .py(6)
          .overflow_y_scrollbar()
          .when(this.log.length === 0, (el) => el.child(div().px(18).py(10).text_size(12).text_color(C.dim).child("Bots report back here.")))
          .children(this.log.map(entry)),
      )
      .when(Boolean(a), (el) =>
        el.child(
          v_flex()
            .flex_none()
            .m(12)
            .p(14)
            .gap(8)
            .rounded(14)
            .bg(C.card)
            .border_1()
            .border_color(C.line)
            .child(
              h_flex()
                .gap(8)
                .items_center()
                .child(div().size(6).rounded_full().bg("#885cf5"))
                .child(div().text_size(11).font_semibold().text_color("#a78bfa").child("MEMORY")),
            )
            .child(div().text_size(13).text_color(C.text).child(`Updated memory for ${nameOf(a)}`))
            .child(div().text_size(12).text_color(C.muted).child(`Works on ${machineName(space?.machine)} in ${folder(pane?.cwd, space?.machine) || a.space_name}${pane?.branch ? ` on ${pane.branch}` : ""}.`))
            .child(div().text_size(12).text_color(C.muted).truncate().child(a.title ? `Last seen: ${a.title}` : `Runs ${a.program?.name}.`)),
        ),
      );
  }

  launch(options, cx) {
    try {
      const command = launchCommand(this.launcherTarget, spaces(), machines(), options);
      closeOverlay(props().overlay);
      run(command.name, command.args);
    } catch (error) { this.launcherError = String(error.message ?? error); cx.notify(); }
  }

  // Step one of New Bot: which workspace the Bot works in.
  spacePicker() {
    const groups = machineGroups(machines(), spaces(), agents());
    const rows = [];
    const body = [];

    const spaceRow = (m, s, i) => own(h_flex())
      .id(`gb-pick-space-${s.id}`)
      .flex_none()
      .h(34).px(10).gap(8).rounded(7).items_center()
      .text_size(12).text_color(C.text)
      .cursor_pointer()
      .hover(state => state.bg(C.raised))
      .on_click(() => { closeOverlay(props().overlay); openNew(m.name, s.id); })
      .child(div().flex_none().w(12).text_size(10).text_color(C.dim).child(i < 9 ? String(i + 1) : ""))
      .child(div().flex_1().min_w(0).truncate().child(s.name))
      .when(s.active, (el) => el.child(div().text_size(9).text_color(C.dim).child("open")))
      .when(Boolean(s.status), (el) => el.child(statusDot(s.status, 6)))
      .child(div().flex_none().text_size(10).text_color(C.dim)
        .child(`${s.tabs.length} thread${s.tabs.length === 1 ? "" : "s"}`));

    for (const m of groups) {
      if (!m.spaces.length) continue;
      body.push(h_flex().id(`gb-pick-machine-${m.name == null ? "here" : `remote-${m.name}`}`)
        .flex_none().px(10).pt(10).pb(4).gap(6).items_center().text_color(C.dim)
        .child(machineGlyph(11))
        .child(div().flex_1().min_w(0).truncate().text_size(10).child(machineName(m.name)))
        .child(div().text_size(10).text_color(C.dim).child(machineStatus(m))));
      for (const s of m.spaces) {
        const i = rows.length;
        rows.push({ machine: m.name, space: s });
        body.push(spaceRow(m, s, i));
      }
    }
    this.pickList = rows;

    return v_flex().id("gb-pick-space")
      .when(Boolean(this.pickFocus), (el) => el.track_focus(this.pickFocus))
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props().overlay); return; }
        if (!/^[1-9]$/.test(e.key)) return;
        const hit = rows[Number(e.key) - 1];
        if (hit) { closeOverlay(props().overlay); openNew(hit.machine, hit.space.id); }
      })
      .w_full().h(460).min_h(0).p(8).bg(C.card).text_color(C.text)
      .child(h_flex().px(10).pt(6).pb(4).gap(8).items_center()
        .child(div().flex_1().text_size(13).font_semibold().child("New Bot"))
        .child(div().text_size(10).text_color(C.dim).child("Esc")))
      .child(div().px(10).pb(10).text_size(11).text_color(C.dim).child("Which workspace should it work in?"))
      .child(v_flex().id("gb-pick-list").flex_1().min_h(0).overflow_y_scrollbar().children(body))
      .child(div().h(1).my(6).bg(C.line))
      .child(own(h_flex())
        .id("gb-pick-new-space")
        .flex_none().h(34).px(10).gap(8).rounded(7).items_center()
        .text_size(12).text_color(C.muted).cursor_pointer()
        .hover((state) => state.bg(C.raised).text_color(C.text))
        .on_click(() => { closeOverlay(props().overlay); openNew(props().machine ?? null, null); })
        .child(div().flex_1().child("New workspace…")));
  }

  newMenu() {
    const target = this.launcherTarget ?? { machine: null, space: null };
    const host = machineGroups(machines(), spaces(), []).find(m => m.name === target.machine);
    const ready = host?.layout === "ready" && (!target.space || host.spaces.some(s => s.id === target.space));
    const workspace = spaces().find(s => s.id === target.space);
    const folder = panes().find(p => workspace?.tabs.some(t => t.id === p.tab) && p.cwd)?.cwd || workspace?.folder;
    const installed = (this.launcherAgents ?? []).filter(a => a.installed);
    const choices = [...installed, ...(this.launcherAgents ?? []).filter(a => !a.installed).slice(0, 2)];
    const mod = window()?.platform === "macos" ? "⌘" : "Ctrl";
    const row = (id, text, action, enabled = true, hint = "") => h_flex().id(id).h(34).px(10).gap(8).rounded(7).items_center().flex_none()
      .text_size(12).text_color(enabled ? C.text : C.dim).disabled(!enabled)
      .when(enabled, el => el.cursor_pointer().hover(s => s.bg(C.raised)))
      .on_click((_e, cx) => { if (enabled) action(cx); })
      .child(div().flex_1().min_w(0).truncate().child(text))
      .when(Boolean(hint), el => el.child(div().text_size(10).text_color(C.dim).child(hint)));
    const worktree = (action, cx) => {
      try { launchCommand(target, spaces(), machines()); }
      catch (error) { this.launcherError = String(error.message ?? error); cx.notify(); return; }
      closeOverlay(props().overlay);
      openOverlay({ mod: "worktree", kind: "dialog", width: action === "new" ? 460 : 560, height: action === "new" ? 280 : 480,
        props: { space: target.space, ...(folder ? { folder } : {}), action } });
    };
    return v_flex().id("gb-new-menu").when(Boolean(this.launcherFocus), el => el.track_focus(this.launcherFocus))
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props().overlay); return; }
        if (!ready || (!e.modifiers.control && !e.modifiers.platform)) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (agent) this.launch({ argv: agent.run, name: agent.name }, cx);
        else if (e.key === "t") this.launch({}, cx);
        else if (e.key === "n") this.launch({ workspaceOnly: true }, cx);
      })
      .w_full().h(450).min_h(0).p(8).bg(C.card).text_color(C.text)
      .child(h_flex().px(10).pt(6).pb(10).gap(8).items_center().child(machineGlyph())
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().text_size(13).font_semibold().truncate().child(machineName(target.machine)))
          .child(div().text_size(11).text_color(C.dim).truncate().child(workspace?.name ?? "New workspace"))))
      .when(!ready, el => el.child(div().px(10).py(8).text_size(12).text_color(st("blocked").color).child("Machine or workspace unavailable.")))
      .child(row("gb-new-terminal", "Terminal", cx => this.launch({}, cx), ready, `${mod} T`))
      .child(div().px(10).pt(12).pb(6).text_size(10).text_color(C.dim).child("START A BOT"))
      .child(v_flex().id("gb-new-agents").flex_1().min_h(0).overflow_y_scrollbar()
        .when(Boolean(this.launcherLoading), el => el.child(div().px(10).py(8).text_size(12).text_color(C.dim).child("Checking installed agents…")))
        .when(!this.launcherLoading && !(this.launcherAgents ?? []).length && !this.launcherError, el => el.child(div().px(10).py(8).text_size(12).text_color(C.dim).child("No agents found on this machine.")))
        .children(choices.map((a, i) => row(`gb-new-agent-${a.key}`, a.name,
          cx => this.launch({ argv: a.run, name: a.name }, cx), ready && a.installed, a.installed ? (i < 9 ? `${mod} ${i + 1}` : "") : "not installed"))))
      .when(Boolean(this.launcherError), el => el.child(div().px(10).py(8).text_size(11).text_color(st("blocked").color).child(this.launcherError)))
      .child(div().h(1).my(6).bg(C.line))
      .child(row("gb-new-workspace", "New workspace", cx => this.launch({ workspaceOnly: true }, cx), ready, `${mod} N`))
      .child(row("gb-new-worktree", "New worktree…", cx => worktree("new", cx), ready && Boolean(workspace)))
      .child(row("gb-open-worktree", "Open worktree…", cx => worktree("open", cx), ready && Boolean(workspace)));
  }

  saveMachineName() {
    setShared(machineKey(props().machine), this.machineInput.value().trim());
    closeOverlay(props().overlay);
  }

  renameMachineDialog() {
    return v_flex().id("gb-rename-machine").track_focus(this.machineFocus)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
      })
      .w_full().p(18).gap(12).bg(C.card).text_color(C.text)
      .child(div().text_size(15).font_semibold().child("Rename machine"))
      .child(div().text_size(12).text_color(C.muted).child(`Connection: ${defaultMachineName(props().machine)}`))
      .child(Input.new(this.machineInput).h(36).px(10).rounded(9).border_1().border_color(C.edge)
        .bg(C.ink).text_size(13).text_color(C.text))
      .child(div().text_size(11).text_color(C.dim).child("Display name in GrokBot. Leave blank to restore the original name."))
      .child(h_flex().gap(8).justify_end()
        .child(pill("gb-machine-rename-cancel", "Cancel", () => closeOverlay(props().overlay)))
        .child(pill("gb-machine-rename-save", "Save", () => this.saveMachineName(), true)));
  }

  render() {
    const role = props()?.role;
    if (role === "rename-machine") return this.renameMachineDialog();
    if (role === "pick-space") return this.spacePicker();
    if (role === "new") return this.newMenu();
    if (role === "sidebar") return this.sidebar();
    if (role === "header") return this.header();
    if (role === "composer") return this.composer();
    if (role === "activity") return this.activity();
    return div();
  }
}
