const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..', '..')
const versionPath = path.join(rootDir, 'VERSION')
const changelogPath = path.join(rootDir, 'CHANGELOG.md')

console.log('Root:', rootDir)
console.log('VERSION exists:', fs.existsSync(versionPath))
console.log('CHANGELOG exists:', fs.existsSync(changelogPath))

const version = fs.readFileSync(versionPath, 'utf8').trim()
let changelog = fs.readFileSync(changelogPath, 'utf8')
changelog = changelog.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

console.log('\nVERSION:', JSON.stringify(version))
console.log('CHANGELOG length:', changelog.length)

const header = `## [${version}] - `
const idx = changelog.indexOf(header)
console.log('\nHeader found:', idx !== -1, 'at index', idx)
if (idx !== -1) {
  const start = idx + header.length
  const afterDate = changelog.indexOf('\n', start)
  const contentStart = afterDate + 1
  const tail = changelog.substring(contentStart)
  const nextVersion = tail.match(/\n## \[/)
  const nextSep = tail.match(/\n---\s*\n/)
  console.log('nextVersion.index:', nextVersion ? nextVersion.index : null)
  console.log('nextSep.index:', nextSep ? nextSep.index : null)
  let end = changelog.length
  if (nextVersion && nextVersion.index !== undefined) end = contentStart + nextVersion.index
  if (nextSep && nextSep.index !== undefined) end = Math.min(end, contentStart + nextSep.index)
  const content = changelog.substring(contentStart, end).trim()
  console.log('contentStart:', contentStart, 'end:', end)
  console.log('Content length:', content.length)
  console.log('Content:\n---\n' + content + '\n---')
} else {
  console.log('Section not found')
}
