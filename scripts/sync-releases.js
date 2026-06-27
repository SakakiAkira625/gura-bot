const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure Git path is in environment variables (for Windows environments where it might not be global)
const gitPath = 'C:\\Program Files\\Git\\cmd';
if (!process.env.PATH.includes(gitPath)) {
  process.env.PATH = `${gitPath};${process.env.PATH}`;
}

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

// Helper to run shell commands safely
function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    throw new Error(error.stderr ? error.stderr.trim() : error.message);
  }
}

// Parse CHANGELOG.md
function parseChangelog() {
  if (!fs.existsSync(changelogPath)) {
    console.error(`Changelog not found at ${changelogPath}`);
    return {};
  }

  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const releases = {};
  let currentVersion = null;
  let currentNotes = [];
  let currentDate = '';

  const versionHeaderRegex = /^##\s+\[?([0-9]+\.[0-9]+\.[0-9]+)\]?(?:\s*-\s*([0-9]{4}-[0-9]{2}-[0-9]{2}))?/;

  for (const line of lines) {
    const match = line.match(versionHeaderRegex);
    if (match) {
      if (currentVersion) {
        releases[currentVersion] = {
          date: currentDate,
          notes: currentNotes.join('\n').trim()
        };
      }
      currentVersion = match[1];
      currentDate = match[2] || '';
      currentNotes = [];
    } else if (currentVersion !== null) {
      // Clean up footer lines in the middle of notes if any
      if (line.includes('格式基於 [Keep a Changelog]') || line.includes('並且本專案遵循 [語意化版本控制]')) {
        continue;
      }
      currentNotes.push(line);
    }
  }

  if (currentVersion) {
    releases[currentVersion] = {
      date: currentDate,
      notes: currentNotes.join('\n').trim()
    };
  }

  return releases;
}

// Check if a release already exists on GitHub
function releaseExists(tag) {
  try {
    runCmd(`gh release view ${tag}`);
    return true;
  } catch (err) {
    if (err.message.includes('release not found')) {
      return false;
    }
    // For other errors, log it and assume we might need to create or edit
    console.warn(`[Warning] Failed to check release status for ${tag}: ${err.message}`);
    return false;
  }
}

// Sync a specific tag
function syncTag(tag, releaseData) {
  const version = tag.replace(/^v/, '');
  const data = releaseData[version];

  if (!data) {
    console.log(`[Skip] No changelog entry found for version ${version} (tag: ${tag})`);
    return;
  }

  const title = tag;
  const notes = data.notes;

  // Write notes to a temp file to avoid command line length or escaping issues
  const tempNotesPath = path.join(__dirname, `temp_notes_${tag}.md`);
  fs.writeFileSync(tempNotesPath, notes, 'utf8');

  try {
    const exists = releaseExists(tag);
    if (exists) {
      console.log(`[Sync] Updating existing release for tag ${tag}...`);
      runCmd(`gh release edit ${tag} --title "${title}" --notes-file "${tempNotesPath}"`);
      console.log(`[Success] Release updated for tag ${tag}.`);
    } else {
      console.log(`[Sync] Creating new release for tag ${tag}...`);
      runCmd(`gh release create ${tag} --title "${title}" --notes-file "${tempNotesPath}"`);
      console.log(`[Success] Release created for tag ${tag}.`);
    }
  } catch (error) {
    console.error(`[Error] Failed to sync release for tag ${tag}: ${error.message}`);
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempNotesPath)) {
      try {
        fs.unlinkSync(tempNotesPath);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

function main() {
  console.log('Starting GitHub Releases sync...');
  const releaseData = parseChangelog();
  
  // Get tags from command line argument, or all local tags
  const args = process.argv.slice(2);
  let tagsToSync = [];

  if (args.length > 0) {
    tagsToSync = args.filter(tag => /^v\d+\.\d+\.\d+$/.test(tag));
    if (tagsToSync.length === 0) {
      console.error('No valid tags provided as arguments. Expected format: vX.Y.Z');
      process.exit(1);
    }
  } else {
    try {
      const allTags = runCmd('git tag')
        .split(/\r?\n/)
        .map(t => t.trim())
        .filter(t => /^v\d+\.\d+\.\d+$/.test(t));
      tagsToSync = allTags;
    } catch (error) {
      console.error(`Failed to retrieve git tags: ${error.message}`);
      process.exit(1);
    }
  }

  console.log(`Found ${tagsToSync.length} tag(s) to sync.`);

  // Iterate over tags and sync them
  for (const tag of tagsToSync) {
    try {
      syncTag(tag, releaseData);
    } catch (e) {
      console.error(`Failed during sync of tag ${tag}: ${e.message}`);
    }
  }

  console.log('GitHub Releases sync completed.');
}

if (require.main === module) {
  main();
}
