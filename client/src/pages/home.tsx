import { useUser } from "@/hooks/use-auth";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight, Megaphone, Users, Mail, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { KO } from "@/i18n/ko";

export default function Home() {
  const { data: user } = useUser();

  const features = [
    { title: KO.pages.home.discover, desc: KO.pages.home.discoverDesc, icon: Users, href: "/discover", color: "text-blue-500", bg: "bg-blue-50" },
    { title: KO.pages.home.campaigns, desc: KO.pages.home.campaignsDesc, icon: Megaphone, href: "/campaigns", color: "text-purple-500", bg: "bg-purple-50" },
    { title: KO.pages.home.email, desc: KO.pages.home.emailDesc, icon: Mail, href: "/email", color: "text-pink-500", bg: "bg-pink-50" },
    { title: KO.pages.home.tracking, desc: KO.pages.home.trackingDesc, icon: TrendingUp, href: "/tracking", color: "text-green-500", bg: "bg-green-50" },
  ];

  return (
    <Layout>
      <div className="space-y-4 md:space-y-8">
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-r from-primary to-blue-600 p-4 md:p-8 lg:p-12 text-white shadow-xl">
          <div className="relative z-10">
            <h1 className="text-xl md:text-3xl lg:text-4xl font-bold font-display mb-1 md:mb-2">{KO.pages.home.welcomeBack}, {user?.name.split(' ')[0]}!</h1>
            <p className="text-blue-100 max-w-xl text-sm md:text-lg mb-4 md:mb-6">
              3{KO.pages.home.activeCampaigns} 5{KO.pages.home.pendingApprovals}
            </p>
            <Link href="/campaigns">
              <Button size="sm" variant="secondary" className="font-semibold shadow-lg md:text-base md:px-4 md:py-2" data-testid="button-go-campaigns">
                {KO.pages.home.goToCampaigns} <ArrowRight className="ml-1 md:ml-2 h-3 w-3 md:h-4 md:w-4" />
              </Button>
            </Link>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/2 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800&q=80')] bg-cover opacity-10 mix-blend-overlay"></div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
          {features.map((feature) => (
            <Link key={feature.title} href={feature.href}>
              <Card className="hover:shadow-md transition-all cursor-pointer border-border/50 group h-full" data-testid={`card-feature-${feature.title}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-4 pb-1 md:pb-2 gap-2">
                  <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {feature.title}
                  </CardTitle>
                  <div className={`p-1.5 md:p-2 rounded-full ${feature.bg} ${feature.color} shrink-0`}>
                     <feature.icon className="h-3 w-3 md:h-4 md:w-4" />
                  </div>
                </CardHeader>
                <CardContent className="p-3 md:p-4 pt-0 md:pt-0">
                  <div className="text-sm md:text-xl lg:text-2xl font-bold leading-tight">{feature.desc}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="border-border/60">
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-xl">{KO.pages.home.recentActivity}</CardTitle>
            <CardDescription className="text-xs md:text-sm">{KO.pages.home.latestUpdates}</CardDescription>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            <div className="space-y-3 md:space-y-4">
              {[1,2,3].map((i) => (
                <div key={i} className="flex items-center gap-2 md:gap-4 pb-3 md:pb-4 border-b last:border-0 last:pb-0">
                  <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500 shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs md:text-sm font-medium truncate">{KO.pages.home.newInfluencerAdded}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">2{KO.common.hoursAgo} • {KO.common.by} Admin</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
