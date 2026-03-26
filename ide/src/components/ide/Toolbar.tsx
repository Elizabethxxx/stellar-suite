import { Menu, Network, Settings, TestTube, Upload, X } from "lucide-react";
import { useState } from "react";

import { BuildButton } from "@/components/ide/BuildButton";
import { Button } from "@/components/ui/button";
import { type NetworkKey } from "@/lib/networkConfig";

type BuildState = "idle" | "building" | "success" | "error";

interface ToolbarProps {
  onCompile: () => void;
  onDeploy: () => void;
  onTest: () => void;
  isCompiling: boolean;
  buildState: BuildState;
  network: NetworkKey;
  onNetworkChange: (network: NetworkKey) => void;
  saveStatus?: string;
}

export function Toolbar({
  onCompile,
  onDeploy,
  onTest,
  isCompiling,
  buildState,
  network,
  onNetworkChange,
  saveStatus,
}: ToolbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="border-b border-border bg-toolbar-bg">
      <div className="hidden items-center justify-between px-3 py-1.5 md:flex">
        <div className="flex items-center gap-2">
          <span className="mr-2 font-mono text-sm font-semibold text-primary">
            Kit CANVAS
          </span>
          <BuildButton
            onClick={onCompile}
            isBuilding={isCompiling}
            state={isCompiling ? "building" : buildState}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5 text-xs"
            onClick={onDeploy}
          >
            <Upload className="h-3.5 w-3.5" />
            Deploy
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5 text-xs"
            onClick={onTest}
          >
            <TestTube className="h-3.5 w-3.5" />
            Test
          </Button>
          {saveStatus && (
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
              {saveStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            <select
              value={network}
              onChange={(e) => onNetworkChange(e.target.value as NetworkKey)}
              className="rounded border border-border bg-secondary px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="testnet">Testnet</option>
              <option value="futurenet">Futurenet</option>
              <option value="mainnet">Mainnet</option>
              <option value="local">Local</option>
            </select>
          </label>
          <button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 py-1.5 md:hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-primary">
            Kit CANVAS
          </span>
          <BuildButton
            onClick={onCompile}
            isBuilding={isCompiling}
            state={isCompiling ? "building" : buildState}
            compact
          />
        </div>
        <div className="flex items-center gap-1">
          {saveStatus && (
            <span className="font-mono text-[9px] text-muted-foreground">{saveStatus}</span>
          )}
          <select
            value={network}
            onChange={(e) => onNetworkChange(e.target.value as NetworkKey)}
            className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none"
          >
            <option value="testnet">Testnet</option>
            <option value="futurenet">Futurenet</option>
            <option value="mainnet">Mainnet</option>
            <option value="local">Local</option>
          </select>
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="flex gap-1 border-b border-border px-2 pb-2 md:hidden">
          <Button
            type="button"
            className="flex-1 gap-1"
            onClick={() => {
              onCompile();
              setMobileMenuOpen(false);
            }}
            disabled={isCompiling}
          >
            Build
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-1"
            onClick={() => {
              onDeploy();
              setMobileMenuOpen(false);
            }}
          >
            Deploy
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-1"
            onClick={() => {
              onTest();
              setMobileMenuOpen(false);
            }}
          >
            Test
          </Button>
        </div>
      )}
    </div>
  );
}
