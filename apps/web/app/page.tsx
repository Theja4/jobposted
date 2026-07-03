import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { SocialProof } from "@/components/landing/SocialProof";
import { Steps } from "@/components/landing/Steps";
import { OpportunityUnlock } from "@/components/landing/OpportunityUnlock";
import { Metrics } from "@/components/landing/Metrics";
import { BigWord } from "@/components/landing/BigWord";
import { StatRows } from "@/components/landing/StatRows";
import { Trust } from "@/components/landing/Trust";
import { JobTrackerShowcase } from "@/components/landing/JobTrackerShowcase";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-white">
      <Nav />
      <Hero />
      <SocialProof />
      <JobTrackerShowcase />
      <OpportunityUnlock />
      <Metrics />
      <BigWord />
      <StatRows />
      <Trust />
      <Steps />
      <div className="bg-[radial-gradient(circle_at_16%_16%,rgba(30,123,255,0.16),transparent_28%),radial-gradient(circle_at_86%_32%,rgba(22,199,212,0.14),transparent_30%),radial-gradient(circle_at_18%_82%,rgba(31,100,224,0.16),transparent_28%),radial-gradient(circle_at_86%_88%,rgba(22,199,212,0.14),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f7fbff_30%,#e9f5ff_50%,#ddecff_65%,#cfe4ff_78%,#b6d6ff_90%,#9ec4ff_100%)]">
        <Faq />
        <FinalCta />
        <Footer seamless />
      </div>
    </main>
  );
}
