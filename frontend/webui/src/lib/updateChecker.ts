import { GITHUB_REPO, BUNDLE_VERSION } from "@/version"
import { reportClientError } from "./logger"

export interface UpdateInfo {
  tag: string
  url: string
}

interface GithubRelease {
  tag_name: string
  html_url: string
  prerelease: boolean
  draft: boolean
}

export async function checkForUpdate(
  channel: "dev" | "beta" | "stable"
): Promise<UpdateInfo | null> {
  let releases: GithubRelease[]
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      { headers: { Accept: "application/vnd.github+json" } }
    )
    if (!res.ok) {
      reportClientError("warning", `GitHub API 응답 실패: ${String(res.status)}`)
      return null
    }
    releases = (await res.json()) as GithubRelease[]
  } catch (err) {
    reportClientError("warning", `업데이트 확인 실패: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }

  const latest = releases.find((r) => {
    if (r.draft) return false
    if (channel === "dev") return true
    if (channel === "stable") return !r.prerelease
    return !r.tag_name.includes("-dev")
  })

  if (!latest || latest.tag_name === BUNDLE_VERSION) return null
  return { tag: latest.tag_name, url: latest.html_url }
}
