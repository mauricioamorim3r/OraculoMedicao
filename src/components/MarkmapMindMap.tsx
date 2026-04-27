import { Download, GitBranch } from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

const transformer = new Transformer();

const downloadSvg = (svg: SVGSVGElement | null, fileName: string) => {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

interface MarkmapMindMapProps {
  markdown: string;
  fileName: string;
}

export function MarkmapMindMap({ markdown, fileName }: MarkmapMindMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = useMemo(() => transformer.transform(markdown).root, [markdown]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    svg.replaceChildren();
    const markmap = Markmap.create(
      svg,
      {
        autoFit: true,
        duration: 250,
        initialExpandLevel: 3,
        maxWidth: 360,
        nodeMinHeight: 24,
        paddingX: 10,
        spacingHorizontal: 72,
        spacingVertical: 8,
      },
      data,
    );

    const fitTimer = window.setTimeout(() => markmap.fit(), 80);
    return () => {
      window.clearTimeout(fitTimer);
      svg.replaceChildren();
    };
  }, [data]);

  return (
    <div className="mt-4 rounded-2xl border border-oracle-red/15 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-oracle-red">
          <GitBranch size={14} /> Mapa mental visual
        </div>
        <button
          onClick={() => downloadSvg(svgRef.current, fileName)}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#334155] hover:text-oracle-red"
        >
          <Download size={12} /> SVG
        </button>
      </div>
      <div className="h-[460px] overflow-hidden rounded-xl border border-black/5 bg-white">
        <svg ref={svgRef} className="h-full w-full" aria-label="Mapa mental visual" role="img" />
      </div>
    </div>
  );
}
