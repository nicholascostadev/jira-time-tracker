import { readFile } from "node:fs/promises"

async function run(): Promise<void> {
  const packageJsonRaw = await readFile(new URL("../package.json", import.meta.url), "utf8")
  const packageJson = JSON.parse(packageJsonRaw) as { version: string }
  const version = packageJson.version

  if (!version) {
    throw new Error("Unable to read package version from package.json")
  }

  const tag = `v${version}`

  await Bun.$`git fetch --tags origin`

  const tagCheck = Bun.spawn(["git", "rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    stdout: "ignore",
    stderr: "ignore",
  })

  const exitCode = await tagCheck.exited
  if (exitCode === 0) {
    console.log(`Tag ${tag} already exists. Skipping.`)
    return
  }

  console.log(`Creating and pushing ${tag}`)
  await Bun.$`git tag ${tag}`
  await Bun.$`git push origin ${tag}`
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
