# Herdr layouts

Layouts for [Herdr](https://herdr.dev), the desktop app for terminals and coding agents.
Each folder here is one whole window: a `layouts/<name>.json`, the `mods/` it needs, a
`RECIPE.md` (the brief another agent could rebuild it from) and a `preview.png`.

| Layout | What it is | Files |
|---|---|---|
| **Grok Bot** | Your coding agents as teammates you message: a buddy list of Bots, the focused Bot's terminal as a chat thread, and an Activity feed. | [`grokbot/`](grokbot/) · [preview](grokbot/preview.png) · [recipe](grokbot/RECIPE.md) |

![Grok Bot](grokbot/preview.png)

## Use one

Herdr redraws itself from the files in `~/.config/herdr-app`, so installing a layout is copying
files. Let your agent do it — it should read every file first:

> Add the Grok Bot layout from https://github.com/xdays/herdr-layouts to my Herdr.

By hand:

```sh
git clone https://github.com/xdays/herdr-layouts
cd herdr-layouts/grokbot
cp layouts/grokbot.json layouts/grokbot.svg ~/.config/herdr-app/layouts/
cp -R mods/grokbot ~/.config/herdr-app/mods/
```

Then switch to it with `cmd-shift-l` (or `herdr-app do layout.switch --name grokbot`). Nothing is
overwritten as long as those names are free — rename the file, the `mod` references and the
`mods/<name>/` asset paths together if they aren't. Leave `RECIPE.md` and `preview.png` out of
`~/.config/herdr-app`; they are for reading, not for the app. Your own layout stays as it was, and
deleting the files removes this one.

**Discard the layout if it goes wrong:** `ctrl-alt-shift-escape` always works — it sets the shown
layout and `keys.json` aside and returns to the default layout.

## What each folder holds

```
<layout>/
  layouts/<layout>.json   the window: blocks, theme, fonts, sizes
  layouts/<layout>.svg    the picture Settings shows for it (optional)
  mods/<name>/            the panels it draws, if it has any
  RECIPE.md               the brief: what you see, how it behaves, how it is built
  preview.png             a screenshot of the real thing
```

The `.d.ts` / `jsconfig.json` files the app writes into a mod folder are not included; Herdr
regenerates them at start.

## Sharing one

A layout folder needs a public repo with the topic `herdr-layout` (or `herdr-mod` for a panel);
Herdr lists it at [herdr.dev/layouts](https://herdr.dev/layouts) within the hour. This repo holds
several layouts, one folder each.

## Notes

These are third-party layouts, not reviewed by Herdr. They run as trusted code, like any mod: they
can run programs, read files and reach the network. Read `RECIPE.md` and the mod sources before you
install one.
