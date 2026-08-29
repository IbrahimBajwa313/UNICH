"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
};

/**
 * QTN-02 signature capture — plain <canvas> + pointer events, no external
 * dependency (none exists in this app; see quotation rebuild plan).
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const dirtyRef = useRef(false);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#1a1a1a";
      }
    }, []);

    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        dirtyRef.current = false;
      },
      isEmpty() {
        return !dirtyRef.current;
      },
      toDataUrl() {
        return dirtyRef.current ? canvasRef.current?.toDataURL("image/png") || "" : "";
      },
    }));

    function pos(e: React.PointerEvent<HTMLCanvasElement>) {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ touchAction: "none", cursor: "crosshair" }}
        onPointerDown={(e) => {
          drawingRef.current = true;
          const ctx = canvasRef.current?.getContext("2d");
          const { x, y } = pos(e);
          ctx?.beginPath();
          ctx?.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          const { x, y } = pos(e);
          ctx?.lineTo(x, y);
          ctx?.stroke();
          dirtyRef.current = true;
        }}
        onPointerUp={() => {
          drawingRef.current = false;
        }}
        onPointerLeave={() => {
          drawingRef.current = false;
        }}
      />
    );
  },
);
