import { simpleGit } from "simple-git";

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

export async function showFile(branch: string, filePath: string): Promise<string> {
  return git.show([`${branch}:${filePath}`]);
}

export async function diffNameOnly(base: string, head: string): Promise<string[]> {
  const result = await git.raw(["diff", "--name-only", `${base}...${head}`]);
  return result.trim().split("\n").filter(Boolean);
}

export async function listTree(branch: string, path: string): Promise<string[]> {
  try {
    const result = await git.raw(["ls-tree", "-r", "--name-only", branch, path]);
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
