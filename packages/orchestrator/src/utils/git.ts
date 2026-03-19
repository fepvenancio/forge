import simpleGit from "simple-git";

const git = simpleGit();

export async function listLocalBranches(): Promise<string[]> {
  const branches = await git.branchLocal();
  return branches.all;
}

export async function createBranch(name: string): Promise<void> {
  await git.branch([name]);
}

export async function getGitConfigValue(key: string): Promise<string | null> {
  const result = await git.getConfig(key);
  return result.value ?? null;
}
