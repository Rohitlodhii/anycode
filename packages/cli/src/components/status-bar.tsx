import { TextAttributes } from "@opentui/core";



export function StatusBar(){
    return (
        <box  backgroundColor="#34343d" paddingX={2}  flexDirection="row" gap={1}>
            <text fg="cyan">Build</text>
            <text attributes={TextAttributes.DIM} fg="gray">
                {">"}
            </text>
            <text>
                opus-4.6
            </text>
        </box>
    )
}
