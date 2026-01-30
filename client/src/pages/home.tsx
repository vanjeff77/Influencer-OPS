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
      <div className="space-y-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-blue-600 p-8 md:p-12 text-white shadow-xl">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold md:text-4xl font-display mb-2">{KO.pages.home.welcomeBack}, {user?.name.split(' ')[0]}!</h1>
            <p className="text-blue-100 max-w-xl text-lg mb-6">
              3{KO.pages.home.activeCampaigns} 5{KO.pages.home.pendingApprovals}
            </p>
            <Link href="/campaigns">
              <Button size="lg" variant="secondary" className="font-semibold shadow-lg" data-testid="button-go-campaigns">
                {KO.pages.home.goToCampaigns} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/2 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800&q=80')] bg-cover opacity-10 mix-blend-overlay"></div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Link key={feature.title} href={feature.href}>
              <Card className="hover:shadow-md transition-all cursor-pointer border-border/50 group" data-testid={`card-feature-${feature.title}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {feature.title}
                  </CardTitle>
                  <div className={`p-2 rounded-full ${feature.bg} ${feature.color}`}>
                     <feature.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{feature.desc}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>{KO.pages.home.recentActivity}</CardTitle>
            <CardDescription>{KO.pages.home.latestUpdates}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1,2,3].map((i) => (
                <div key={i} className="flex items-center gap-4 pb-4 border-b last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{KO.pages.home.newInfluencerAdded}</p>
                    <p className="text-xs text-muted-foreground">2{KO.common.hoursAgo} • {KO.common.by} Admin</p>
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
