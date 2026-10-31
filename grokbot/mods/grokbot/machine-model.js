// Machine names and all Herdr ids are opaque: keep remote prefixes intact.
export const machineName = (name) => name == null ? "This computer" : name;
export const machineStatus = (machine) => machine.layout === "ready" ? (machine.name == null ? "Local" : "Connected") : machine.layout === "loading" ? "Connecting…" : "Unavailable";

export function machineGroups(machineList, spaceList, agentList) {
  const available = machineList.filter(m => !m.temporary);
  const hidden = new Set(machineList.filter(m => m.temporary).map(m => m.name));
  const names = [...new Set([null, ...available.map(m => m.name), ...spaceList.map(s => s.machine)])].filter(name => !hidden.has(name));
  names.sort((a, b) => a == null ? (b == null ? 0 : -1) : b == null ? 1 : a.localeCompare(b));
  return names.map(name => {
    const workspaces = spaceList.filter(s => s.machine === name);
    const ids = new Set(workspaces.map(s => s.id));
    return {
      name,
      layout: available.find(m => m.name === name)?.layout ?? (name == null && workspaces.length ? "ready" : "unavailable"),
      spaces: workspaces,
      agents: agentList.filter(a => ids.has(a.space)),
    };
  });
}

export function launchCommand(target, spaceList, machineList, options = {}) {
  const machine = machineGroups(machineList, spaceList, []).find(m => m.name === target.machine);
  if (machine?.layout !== "ready") throw new Error(`${machineName(target.machine)} is not connected yet.`);
  if (target.space && !spaceList.some(s => s.id === target.space && s.machine === target.machine)) {
    throw new Error("This workspace is no longer available. Open New Bot again.");
  }
  if (target.space && !options.workspaceOnly) {
    return { name: "tab.new", args: { space: target.space, ...(options.argv ? { argv: options.argv, name: options.name } : {}) } };
  }
  return { name: "space.new", args: {
    ...(target.machine != null ? { machine: target.machine } : {}),
    ...(options.argv ? { argv: options.argv, tab: options.name } : {}),
  } };
}
