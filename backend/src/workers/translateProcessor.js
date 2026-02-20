const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function pickPythonBin() {
  const bin = String(process.env.TRANSLATE_PYTHON_BIN || process.env.PYTHON_BIN || 'python').trim();
  return bin || 'python';
}

function pickTranslateProvidersFile(backendRoot) {
  const providersFileRel = String(
    process.env.TRANSLATE_LLM_PROVIDERS_FILE
    || process.env.SMART_SEARCH_LLM_PROVIDERS_FILE
    || 'config/llmProviders.json'
  ).trim();
  return path.isAbsolute(providersFileRel)
    ? providersFileRel
    : path.resolve(backendRoot, providersFileRel);
}

function spawnTranslateCli({ inputPath, outputPath, sourceLang, targetLang, providerId }) {
  return new Promise((resolve, reject) => {
    const backendRoot = path.resolve(__dirname, '..', '..');
    const kernelCli = path.resolve(backendRoot, 'translation-kernel', 'cli.py');
    const providersFile = pickTranslateProvidersFile(backendRoot);

    const glossaryFile = path.resolve(backendRoot, 'config', 'translationGlossary.json');

    const args = [
      kernelCli,
      'translate-file',
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--source-lang',
      sourceLang,
      '--target-lang',
      targetLang,
      '--providers-file',
      providersFile,
      '--glossary-file',
      glossaryFile
    ];
    if (providerId) {
      args.push('--provider-id', providerId);
    }

    const py = pickPythonBin();
    const child = spawn(py, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout || '{}');
          return resolve({ parsed, stderr });
        } catch (e) {
          const err = new Error(`Translate kernel returned non-JSON output. stderr=${stderr}`);
          err.code = 'KERNEL_BAD_OUTPUT';
          err.stdout = stdout;
          err.stderr = stderr;
          return reject(err);
        }
      }
      const err = new Error(`Translate kernel failed with code ${code}. stderr=${stderr}`);
      err.code = 'KERNEL_FAILED';
      err.exitCode = code;
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
  });
}

async function processTranslateJob(job) {
  const {
    inputPath,
    outputPath,
    sourceLang,
    targetLang,
    providerId
  } = job.data || {};

  if (!inputPath || !outputPath) throw new Error('Missing inputPath/outputPath');
  if (!sourceLang || !targetLang) throw new Error('Missing sourceLang/targetLang');

  ensureDir(path.dirname(outputPath));

  const t0 = Date.now();
  job.progress(5);
  const { parsed, stderr } = await spawnTranslateCli({
    inputPath,
    outputPath,
    sourceLang,
    targetLang,
    providerId
  });
  job.progress(95);
  const costMs = Date.now() - t0;
  if (process.env.TRANSLATE_LOG_TIMING) {
    console.log(`[Translate] kernel total ${costMs}ms (jobId=${job.id})`);
    if (stderr && stderr.trim()) {
      console.log(`[Translate] kernel timing stderr:\n${stderr.trim()}`);
    }
  }

  return {
    ok: true,
    outputPath,
    meta: parsed?.meta || null,
    warnings: parsed?.warnings || null,
    kernelStderr: process.env.NODE_ENV === 'development' ? stderr : undefined
  };
}

module.exports = { processTranslateJob };

