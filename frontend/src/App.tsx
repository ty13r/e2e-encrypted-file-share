import { SenderPage } from "./SenderPage";
import { RecipientPage } from "./RecipientPage";

export default function App() {
  const isRecipient = window.location.pathname.startsWith("/r/");
  return (
    <div style={{ maxWidth: 760, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Secure file share</h1>
        <nav style={{ marginLeft: "auto", fontSize: 14 }}>
          <a href="/">Send</a>
        </nav>
      </header>
      {isRecipient ? <RecipientPage /> : <SenderPage />}
    </div>
  );
}
