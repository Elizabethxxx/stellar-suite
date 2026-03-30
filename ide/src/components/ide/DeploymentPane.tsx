"use client";

import { useState, useCallback, useMemo } from "react";
import { Rocket, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { discoverWasmFiles, getWasmDisplayName } from "@/lib/wasmDiscovery";
import { analyzeWasm } from "@/utils/awasmParser";
import type { FileNode } from "@/lib/sample-contracts";
import { useDeploymentStore } from "@/store/useDeploymentStore";
import { useIdentityStore } from "@/store/useIdentityStore";
import { useFileStore } from "@/store/useFileStore";

interface DeploymentPaneProps {
  files: FileNode[];
  onDeploy?: (wasmPath: string[], args: any[]) => Promise<void>;
}

export function DeploymentPane({ files, onDeploy }: DeploymentPaneProps) {
  const [selectedWasm, setSelectedWasm] = useState<string | null>(null);
  const [constructorArgs, setConstructorArgs] = useState("");
  const [parsedArgs, setParsedArgs] = useState<any[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [wasmInfo, setWasmInfo] = useState<{
    size: string;
    cost: string;
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);

  const { openDeployModal } = useDeploymentStore();
  const { activeContext } = useIdentityStore();
  const { network } = useFileStore();

  // Discover WASM files
  const wasmFiles = useMemo(() => {
    const all = discoverWasmFiles(files);
    return all.filter(
      (f) => f.path.endsWith(".wasm") && (f.path.includes("out/") || f.path.includes("target/"))
    );
  }, [files]);

  // Parse constructor args safely
  const handleArgsChange = (value: string) => {
    setConstructorArgs(value);
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        setParsedArgs(parsed);
      } else {
        setParsedArgs([]);
      }
    } catch {
      setParsedArgs([]);
    }
  };

  // Analyze WASM
  const handleWasmSelect = useCallback(
    async (wasmPath: string) => {
      setSelectedWasm(wasmPath);
      setWasmInfo(null);
      setConstructorArgs("");
      setParsedArgs([]);

      const pathArray = wasmPath.split("/");
      let current: FileNode | undefined;
      let payload = files;

      for (const part of pathArray) {
        const node = payload.find((n) => n.name === part);
        if (!node) break;
        if (node.type === "file") {
          current = node;
          break;
        }
        payload = node.children || [];
      }

      if (current?.content) {
        try {
          let buffer: ArrayBuffer;

          try {
            const binary = atob(current.content);
            const view = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              view[i] = binary.charCodeAt(i);
            }
            buffer = view.buffer;
          } catch {
            const hex = current.content.replace(/\s/g, "");
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
              bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
            }
            buffer = bytes.buffer;
          }

          const analysis = await analyzeWasm(buffer);
          setWasmInfo({
            size: analysis.sizeFormatted,
            cost: analysis.estimatedDeployCostXLM,
          });
        } catch (err) {
          console.error(err);
          toast.error("Failed to analyze WASM");
        }
      }
    },
    [files]
  );

  // Deploy handler
  const handleDeploy = useCallback(async () => {
    if (!selectedWasm) {
      toast.error("Select a WASM file");
      return;
    }

    if (!activeContext) {
      toast.error("Select an identity");
      return;
    }

    setIsDeploying(true);

    try {
      const pathArray = selectedWasm.split("/");

      setDeployLog((prev) => [...prev, `🚀 Deploy started: ${selectedWasm}`]);

      if (onDeploy) {
        await onDeploy(pathArray, parsedArgs);
      } else {
        // Fallback simulation
        console.log("Deploy payload:", {
          wasm: selectedWasm,
          args: parsedArgs,
          network,
        });

        setDeployLog((prev) => [
          ...prev,
          "📦 Uploading WASM...",
          "🧪 Simulating transaction...",
          "✍️ Signing...",
          "📡 Submitting...",
          "✅ Deployment simulated (no handler)",
        ]);

        openDeployModal();
      }

      toast.success("Deployment triggered");
    } catch (error) {
      console.error(error);
      toast.error("Deployment failed");
      setDeployLog((prev) => [...prev, "❌ Deployment failed"]);
    } finally {
      setIsDeploying(false);
    }
  }, [selectedWasm, activeContext, parsedArgs, onDeploy, network, openDeployModal]);

  const isEmpty = wasmFiles.length === 0;

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Header */}
      <div className="px-3 py-2 text-xs font-semibold border-b flex items-center gap-2">
        <Rocket className="h-3 w-3" />
        Deploy Contract
      </div>

      <div className="flex-1 p-3 space-y-4 overflow-y-auto">
        {isEmpty ? (
          <div className="text-center text-xs text-muted-foreground">
            <AlertCircle className="mx-auto mb-2" />
            No WASM files found. Build first.
          </div>
        ) : (
          <>
            {/* WASM Select */}
            <div>
              <Label className="text-xs">WASM File</Label>
              <Select value={selectedWasm ?? ""} onValueChange={handleWasmSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select WASM" />
                </SelectTrigger>
                <SelectContent>
                  {wasmFiles.map((f) => (
                    <SelectItem key={f.path} value={f.path}>
                      {getWasmDisplayName(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info */}
            {wasmInfo && (
              <div className="text-xs border p-2 rounded">
                Size: {wasmInfo.size} <br />
                Cost: ~{wasmInfo.cost} XLM
              </div>
            )}

            {/* Network */}
            <div className="text-xs border p-2 rounded">
              Network: {network}
            </div>

            {/* Args */}
            <div>
              <Label className="text-xs">Constructor Args (JSON)</Label>
              <Textarea
                value={constructorArgs}
                onChange={(e) => handleArgsChange(e.target.value)}
                placeholder='["hello", 123]'
              />
            </div>

            {/* Advanced */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs flex items-center gap-1"
            >
              <ChevronDown className={cn(showAdvanced && "rotate-180")} />
              Advanced
            </button>

            {showAdvanced && (
              <div className="text-xs border p-2 rounded">
                Deploy steps:
                <ol className="list-decimal ml-4">
                  <li>Upload</li>
                  <li>Simulate</li>
                  <li>Sign</li>
                  <li>Submit</li>
                  <li>Instantiate</li>
                </ol>
              </div>
            )}

            {/* Button */}
            <Button
              onClick={handleDeploy}
              disabled={!selectedWasm || isDeploying || !activeContext}
              className="w-full"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="animate-spin mr-2" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="mr-2" />
                  Deploy Contract
                </>
              )}
            </Button>

            {/* Logs */}
            {deployLog.length > 0 && (
              <div className="bg-black/40 text-xs p-2 rounded font-mono max-h-32 overflow-y-auto">
                {deployLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}