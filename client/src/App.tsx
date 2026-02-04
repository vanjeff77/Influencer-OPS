import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Home from "@/pages/home";
import Discover from "@/pages/discover";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import EmailCenter from "@/pages/email";
import Finance from "@/pages/finance";
import Tracking from "@/pages/tracking";
import Groups from "@/pages/groups";
import Settings from "@/pages/settings";
import Submit from "@/pages/submit";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Home} />
      <Route path="/discover" component={Discover} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/:id" component={CampaignDetail} />
      <Route path="/groups" component={Groups} />
      <Route path="/email" component={EmailCenter} />
      <Route path="/finance" component={Finance} />
      <Route path="/tracking" component={Tracking} />
      <Route path="/settings" component={Settings} />
      <Route path="/submit/:campaignId" component={Submit} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
