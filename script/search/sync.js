#!/usr/bin/env node
import languages from '../../lib/languages.js'
import buildRecords from './build-records.js'
import findIndexablePages from './find-indexable-pages.js'
import { allVersions } from '../../lib/all-versions.js'
import { namePrefix } from '../../lib/search/config.js'
import LunrIndex from './lunr-search-index.js'

// Build a search data file for every combination of product version and language
// e.g. `github-docs-dotcom-en.json` and `github-docs-2.14-ja.json`
export default async function syncSearchIndexes({
  language,
  version,
  dryRun,
  notLanguage,
  outDirectory,
}) {
  const t0 = new Date()

  // build indices for a specific language if provided; otherwise build indices for all languages
  const languagesToBuild = Object.keys(languages).filter((lang) =>
    notLanguage ? notLanguage !== lang : language ? language === lang : true
  )

  // build indices for a specific version if provided; otherwise build indices for all versions
  const versionsToBuild = Object.keys(allVersions).filter((ver) =>
    version ? version === ver : true
  )

  console.log(
    `Building indices for ${language || 'all languages'} and ${version || 'all versions'}.\n`
  )

  // Exclude WIP pages, hidden pages, index pages, etc
  const indexablePages = await findIndexablePages()
  const redirects = {}
  indexablePages.forEach((page) => {
    const href = page.relativePath.replace('index.md', '').replace('.md', '')
    for (let redirectFrom of page.redirect_from || []) {
      // Remember that each redirect_from as a prefix / and often it ends
      // with a trailing /
      if (redirectFrom.startsWith('/')) redirectFrom = redirectFrom.slice(1)
      if (redirectFrom.endsWith('/')) redirectFrom = redirectFrom.slice(0, -1)
      redirects[redirectFrom] = href
    }
  })

  // Build and validate all indices
  for (const languageCode of languagesToBuild) {
    for (const pageVersion of versionsToBuild) {
      // if GHES, resolves to the release number like 2.21, 2.22, etc.
      // if FPT, resolves to 'dotcom'
      // if GHAE, resolves to 'ghae'
      const indexVersion =
        allVersions[pageVersion].plan === 'enterprise-server'
          ? allVersions[pageVersion].currentRelease
          : allVersions[pageVersion].miscBaseName

      // github-docs-dotcom-en, github-docs-2.22-en
      const indexName = `${namePrefix}-${indexVersion}-${languageCode}`

      // The page version will be the new version, e.g., free-pro-team@latest, enterprise-server@2.22
      const records = await buildRecords(
        indexName,
        indexablePages,
        pageVersion,
        languageCode,
        redirects
      )
      const index = new LunrIndex(indexName, records)

      if (!dryRun) {
        await index.write(outDirectory)
        console.log('wrote index to file: ', indexName)
      }
    }
  }
  const t1 = new Date()
  const tookSec = (t1.getTime() - t0.getTime()) / 1000

  console.log('\nDone!')
  console.log(`Took ${tookSec.toFixed(1)} seconds`)
}
