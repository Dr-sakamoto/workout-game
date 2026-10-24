import { useStore } from "./store/useStore";
import { Home } from "./components/Home";
import { Onboarding } from "./components/Onboarding";

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  return onboarded ? <Home /> : <Onboarding />;
}
