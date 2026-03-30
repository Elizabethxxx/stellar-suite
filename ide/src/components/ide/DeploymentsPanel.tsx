"use client";

import { useState } from "react";
import { DeploymentPane } from "@/components/ide/DeploymentPane";
import { DeploymentsView } from "@/components/ide/DeploymentsView";
import type { FileNode } from "@/lib/sample-contracts";

interface DeploymentsPanelProps {
  files: FileNode[];
  activeContractId: string | null;
  onSelectContract: (id: string, network: string) => void;
}

export function DeploymentsPanel({
  files,
  activeContractId,
  onSelectContract,
}: DeploymentsPanelProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 border-b overflow-y-auto">
        <DeploymentPane
          files={files}
          onDeploy={async (path, args) => {
            console.log("DEPLOY TRIGGERED:", { path, args });

            // Simulated delay
            await new Promise((r) => setTimeout(r, 1200));

            console.log("Deployment complete");
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <DeploymentsView
          activeContractId={activeContractId}
          onSelectContract={onSelectContract}
        />
      </div>
    </div>
  );
}