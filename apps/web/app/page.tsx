import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { SocialProof } from "@/components/landing/SocialProof";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Trust } from "@/components/landing/Trust";
import { RezoomedTieIn } from "@/components/landing/RezoomedTieIn";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <SocialProof />
      <Problem />
      <HowItWorks />
      <Trust />
      <RezoomedTieIn />
      <Pricing />
      <div className="bg-[radial-gradient(circle_at_16%_16%,rgba(30,123,255,0.16),transparent_28%),radial-gradient(circle_at_86%_32%,rgba(22,199,212,0.14),transparent_30%),radial-gradient(circle_at_18%_82%,rgba(31,100,224,0.16),transparent_28%),radial-gradient(circle_at_86%_88%,rgba(22,199,212,0.14),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f7fbff_30%,#e9f5ff_50%,#ddecff_65%,#cfe4ff_78%,#b6d6ff_90%,#9ec4ff_100%)]">
        <Faq />
        <Footer seamless />
      </div>
    </main>
  );
}
