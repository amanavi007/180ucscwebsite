"use client";

import { useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { TEAM_PHOTO_BUCKET, teamPhotoUrl } from "@/lib/team-page";
import { cropToJpeg, loadImage } from "./crop-image";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

function isHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

export function PhotoField({
  ownerId,
  value,
  onChange,
  disabled,
}: {
  ownerId: string;
  value: string | null;
  onChange: (path: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState<"reading" | "uploading" | null>(null);

  function closeCropper() {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
    setArea(null);
  }

  async function handleFile(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("That photo is over 15 MB.");
      return;
    }
    setBusy("reading");
    try {
      let blob: Blob = file;
      if (isHeic(file)) {
        const { heicTo } = await import("heic-to");
        blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
      }
      const url = URL.createObjectURL(blob);
      try {
        await loadImage(url); // fails fast on files the browser can't decode
      } catch (err) {
        URL.revokeObjectURL(url);
        throw err;
      }
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setSrc(url);
    } catch {
      toast.error("Couldn't read this photo. Try exporting it as a JPG.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmCrop() {
    if (!src || !area) return;
    setBusy("uploading");
    try {
      const blob = await cropToJpeg(src, area);
      const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
      const { error } = await createClient()
        .storage.from(TEAM_PHOTO_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      onChange(path);
      closeCropper();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4 @2xl:flex-col @2xl:items-start">
      <div className="relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-xl bg-muted @2xl:w-full @2xl:max-w-64">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a just-uploaded file; no optimizer needed
          <img src={teamPhotoUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, value)} alt="Your photo" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Camera className="size-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => inputRef.current?.click()}>
          {busy === "reading" ? "Reading photo..." : value ? "Change photo" : "Upload photo"}
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG, WebP or HEIC. You can zoom and crop next.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (file) void handleFile(file);
          }}
        />
      </div>

      <Dialog open={!!src} onOpenChange={(open) => !open && busy !== "uploading" && closeCropper()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
          </DialogHeader>
          <div className="relative h-80 w-full overflow-hidden rounded-lg bg-black">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={4 / 5}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            )}
          </div>
          <label className="flex items-center gap-3 text-sm">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
              aria-label="Zoom"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy === "uploading"} onClick={closeCropper}>
              Cancel
            </Button>
            <Button type="button" disabled={!area || busy === "uploading"} onClick={confirmCrop}>
              {busy === "uploading" ? "Uploading..." : "Use photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
