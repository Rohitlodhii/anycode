import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Header } from "./components/header";
import { InputBar } from "./components/input-bar";

type AppProps = {
    renderer: CliRenderer;
}

function App({ renderer }: AppProps) {
  return (
    <box 
      flexDirection="column"
      backgroundColor="#0D0D12"
      width="100%"
      height="100%"
    >
      <box 
        flexDirection="column"
        alignItems="center"
        flexGrow={1}
        gap={2}
        paddingTop={2}
      >
        <Header/>
      </box>
      <InputBar onSubmit={()=>{}} renderer={renderer}/>
    </box>
  );
}

const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    exitSignals: ["SIGTERM", "SIGQUIT", "SIGABRT", "SIGHUP", "SIGBREAK"],
});
process.on("SIGINT", () => {});
createRoot(renderer).render(<App renderer={renderer} />);
