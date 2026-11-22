import About from "@/components/About";
import AgentDemoSection from "@/components/agent-demo/AgentDemoSection";
import { AgentProvider } from "@/components/agent-demo/AgentContext";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";
import PlayMode from "@/components/play-mode/PlayMode";
import ProjectGrid from "@/components/ProjectGrid";
import ResumeSection from "@/components/ResumeSection";
import SkillsGraph from "@/components/SkillsGraph";

/**
 * Single-page portfolio. AgentProvider shares the demo's pipeline output
 * between AgentDemoSection (producer), ProjectGrid (live filter), and
 * Nav (status pill).
 */
export default function Home() {
  return (
    <AgentProvider>
      <Nav />
      <main>
        <Hero />
        <About />
        <AgentDemoSection />
        <ProjectGrid />
        <SkillsGraph />
        <ResumeSection />
        <ContactForm />
      </main>
      <Footer />
      {/* Opt-in: renders nothing until the nav's play toggle is switched on. */}
      <PlayMode />
    </AgentProvider>
  );
}
