import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type FileConflictDialogProps = {
  open: boolean;
  filePath: string;
  onKeepLocal: () => void;
  onReloadFromDisk: () => void;
  onShowDiff: () => void;
  onClose: () => void;
};

export function FileConflictDialog({
  open,
  filePath,
  onKeepLocal,
  onReloadFromDisk,
  onShowDiff,
  onClose,
}: FileConflictDialogProps) {
  const fileName =
    filePath.split("/").pop() ?? filePath.split("\\").pop() ?? filePath;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>File Changed on Disk</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{fileName}</strong> has been modified externally. You have
            unsaved local changes. What would you like to do?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onKeepLocal}>
            Keep Local Changes
          </Button>
          <Button variant="outline" onClick={onShowDiff}>
            Show Diff
          </Button>
          <Button variant="destructive" onClick={onReloadFromDisk}>
            Reload from Disk
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
