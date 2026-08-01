import { useRef, useCallback } from "react";
import { TextareaRenderable, type KeyBinding, type KeyEvent, type CliRenderer } from "@opentui/core";
import { StatusBar } from "./status-bar";
import { CommandMenu } from "../command-menu";
import { useCommandMenu } from "../command-menu/use-commandMenu";
import { setClipboardText } from "../lib/clipboard";

type Props = {
    onSubmit : ( text : string ) => void;
    disabled? : boolean;
    renderer: CliRenderer;
};

export const TEXTAREA_KEY_BINDINGS : KeyBinding[] = [
    { name  :"return" ,action : "submit"},
    { name : "enter" , action : "submit"},
    { name : "return" , shift : true , action : "newline"},
    { name : "enter" , shift:true , action : "newline"}
];

export function InputBar({
    onSubmit,disabled = false, renderer
} : Props ) {
    const textareaRef = useRef<TextareaRenderable | null>(null);
    const {
        query,
        show,
        selectedIndex,
        scrollRef,
        onContentChange,
        onSelect,
        onExecute,
        onKeyDown,
    } = useCommandMenu(textareaRef, () => {
        renderer.destroy();
        setTimeout(() => process.exit(0), 50);
    });

    const onSubmitRef = useRef(onSubmit);
    onSubmitRef.current = onSubmit;


    const handleTextAreaContentChange = useCallback((text : string) => {
       const textarea = textareaRef.current;
       if(!textarea){
        return;
       }
       onContentChange
       (textarea.plainText);
    }   , [onContentChange]);



    const handleSubmit = useCallback(() => {
        if (show) {
            onExecute(selectedIndex);
            return;
        }
        const text = textareaRef.current?.plainText ?? "";
        onSubmitRef.current(text);
        if (textareaRef.current) {
            textareaRef.current.setText("");
        }
    }, [show, selectedIndex, onExecute]);

    const handleKeyDown = useCallback((key: KeyEvent) => {
        if (key.ctrl && key.name === "c") {
            key.preventDefault();
            const selected = textareaRef.current?.getSelectedText() ?? "";
            if (selected) {
                renderer.copyToClipboardOSC52(selected);
                setClipboardText(selected);
            }
            return;
        }
        onKeyDown(key);
    }, [onKeyDown, renderer]);

    return (
        <box width={"100%"} alignItems="center">
            <box width="100%" maxWidth={110}>
                <box 
                    position="relative"
                    justifyContent="center"
                    paddingX = {2}
                    paddingY={1}
                    backgroundColor="#1A1A24"
                    width="100%"
                    gap={1}
                >
                    {show && (
                        <box
                          position="absolute"
                          bottom="100%"
                          left={0}
                          width="100%"
                          backgroundColor="#1A1A24"
                          zIndex={10}>
                            <CommandMenu
                                query={query}
                                selectedIndex={selectedIndex}
                                scrollRef={scrollRef}
                                onSelect={onSelect}
                                onExecute={onExecute}
                            />
                        </box>
                    )}
                <textarea
                    ref={textareaRef}
                    focused={!disabled}
                    placeholder={`Ask Anything ....`}
                    keyBindings={TEXTAREA_KEY_BINDINGS}
                    onSubmit={handleSubmit}
                    onContentChange={onContentChange}
                    onKeyDown={handleKeyDown}
                />

                </box>
                <StatusBar/>
            </box>
        </box>
    )
}