import { SenderPage } from "./SenderPage";
import { RecipientPage } from "./RecipientPage";
import "./index.css";

export default function App() {
  const isRecipient = window.location.pathname.startsWith("/r/");
  return (
    <div className="app">
      <header className="app-header">
        <h1>Secure file share</h1>
        <span className="tagline">end-to-end encrypted</span>
        <nav>
          <a href="/">Send</a>
        </nav>
      </header>
      {isRecipient ? <RecipientPage /> : <SenderPage />}
    </div>
  );
}
