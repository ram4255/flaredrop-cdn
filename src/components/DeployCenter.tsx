import React, { useState } from 'react';
import { Download, Copy, Check, ExternalLink, FolderArchive, Github, FileCode, CheckCircle2 } from 'lucide-react';
import { CloudflareDeployConfig, RepoFile } from '../types';
import { generateCloudflareTemplates } from '../lib/cloudflare-templates';
import { downloadRepoZip } from '../lib/zip-exporter';

interface DeployCenterProps {
  config: CloudflareDeployConfig;
  onUpdateConfig: (newConfig: CloudflareDeployConfig) => void;
  onRegenerateSecrets: () => void;
}

export const DeployCenter: React.FC<DeployCenterProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState('README.md');
  const [isExporting, setIsExporting] = useState(false);

  const templates = generateCloudflareTemplates(config);
  const currentFile = templates.find((t) => t.name === selectedFile) || templates[0];

  const officialDeployUrl = `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(config.githubRepoUrl)}`;
  const markdownBadgeSnippet = `[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](${officialDeployUrl})`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadZip = async () => {
    setIsExporting(true);
    try {
      await downloadRepoZip(templates, `${config.projectName}-cloudflare-cdn.zip`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-400 mb-1">
            <Github className="h-4 w-4" />
            <span>Open Source Repository · Cloudflare Deploy Button Integration</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            GitHub Repository &amp; README Deploy Button
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Just like Vercel's deploy button, visitors to your GitHub repository click the button on your README to auto-deploy to their own Cloudflare account.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors whitespace-nowrap"
        >
          <FolderArchive className="h-4 w-4" />
          <span>{isExporting ? 'Packing...' : 'Download Repo (.zip)'}</span>
        </button>
      </div>

      {/* GitHub README Button Section */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>README.md Deploy Button (Like Vercel Deploy Button)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Embed this button in your GitHub repository. When users click it on GitHub, Cloudflare automatically provisions the Worker, D1 DB, and R2 bucket.
            </p>
          </div>

          <button
            type="button"
            onClick={() => copyToClipboard(markdownBadgeSnippet, 'badge')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors whitespace-nowrap"
          >
            {copiedKey === 'badge' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedKey === 'badge' ? 'Copied' : 'Copy README Badge'}</span>
          </button>
        </div>

        {/* Live Preview Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-2">
            <span className="text-[11px] font-medium text-neutral-400 block">
              Rendered GitHub README Button:
            </span>
            <div className="pt-1">
              <a
                href={officialDeployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:opacity-90 transition-opacity"
              >
                <img
                  src="https://deploy.workers.cloudflare.com/button"
                  alt="Deploy to Cloudflare Workers"
                  referrerPolicy="no-referrer"
                  className="h-8"
                />
              </a>
            </div>
            <p className="text-[11px] text-neutral-500 pt-1">
              Links directly to: <code className="font-mono text-orange-400 break-all">{officialDeployUrl}</code>
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-2">
            <span className="text-[11px] font-medium text-neutral-400 block">
              Target GitHub Repository URL:
            </span>
            <input
              type="text"
              value={config.githubRepoUrl}
              onChange={(e) => onUpdateConfig({ ...config, githubRepoUrl: e.target.value })}
              placeholder="https://github.com/username/my-cdn"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-white font-mono placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            />
            <span className="text-[10px] text-neutral-500 block">
              Updates your README deploy button destination
            </span>
          </div>
        </div>

        {/* Raw Markdown Snippet */}
        <div className="rounded-xl bg-neutral-950 p-3 font-mono text-xs text-neutral-300 overflow-x-auto border border-neutral-800">
          <code>{markdownBadgeSnippet}</code>
        </div>
      </div>

      {/* Repository File Explorer */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 overflow-hidden shadow-lg">
        {/* Tab Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {templates.map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setSelectedFile(file.name)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs transition-colors whitespace-nowrap ${
                  selectedFile === file.name
                    ? 'bg-neutral-800 text-orange-400 font-bold'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>{file.name}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => copyToClipboard(currentFile.content, currentFile.name)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 transition-colors"
          >
            {copiedKey === currentFile.name ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copiedKey === currentFile.name ? 'Copied' : `Copy ${currentFile.name}`}</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="p-4 bg-neutral-950 max-h-[500px] overflow-y-auto">
          <pre className="font-mono text-xs text-neutral-200 leading-relaxed overflow-x-auto">
            <code>{currentFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
