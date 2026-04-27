import { useState } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Advantages from "@/components/Advantages";
import Delivery from "@/components/Delivery";
import MapPlaceholder from "@/components/MapPlaceholder";
import Footer from "@/components/Footer";

const Index = () => {
  const [routeFrom, setRouteFrom] = useState<string | undefined>();
  const [routeTo, setRouteTo] = useState<string | undefined>();

  const handleRouteChange = (from: string, to: string) => {
    setRouteFrom(from);
    setRouteTo(to);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero onRouteChange={handleRouteChange} />
      <Advantages />
      <Delivery />
      <MapPlaceholder routeFrom={routeFrom} routeTo={routeTo} />
      <Footer />
    </div>
  );
};

export default Index;
