import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { KO } from "@/i18n/ko";

export default function Finance() {
  const transactions = [
    { id: 1, campaign: "서머 런칭", influencer: "김유나", amount: 500000, date: "2024-05-15", status: "paid" },
    { id: 2, campaign: "서머 런칭", influencer: "이준호", amount: 750000, date: "2024-05-18", status: "pending" },
    { id: 3, campaign: "윈터 프로모", influencer: "박소연", amount: 1200000, date: "2024-02-10", status: "paid" },
    { id: 4, campaign: "윈터 프로모", influencer: "최민수", amount: 300000, date: "2024-02-12", status: "paid" },
  ];

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'paid': return KO.status.paid;
      case 'pending': return KO.status.pending;
      default: return status;
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{KO.pages.finance.title}</h1>
          <p className="text-muted-foreground mt-1">{KO.pages.finance.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{KO.pages.finance.totalSpend}</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">24,500,000원</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <TrendingUp className="w-3 h-3 text-green-500 mr-1" />
                +12% {KO.pages.finance.fromLastMonth}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{KO.pages.finance.pendingPayments}</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">3,250,000원</div>
              <p className="text-xs text-muted-foreground mt-1">5{KO.pages.finance.invoicesPending}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{KO.pages.finance.avgCost}</CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">685,000원</div>
              <p className="text-xs text-muted-foreground mt-1">{KO.pages.finance.basedOnCampaigns}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{KO.pages.finance.recentTransactions}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{KO.pages.finance.date}</TableHead>
                  <TableHead>{KO.pages.finance.campaign}</TableHead>
                  <TableHead>{KO.pages.finance.influencer}</TableHead>
                  <TableHead>{KO.pages.finance.status}</TableHead>
                  <TableHead className="text-right">{KO.pages.finance.amount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                    <TableCell>{tx.date}</TableCell>
                    <TableCell className="font-medium">{tx.campaign}</TableCell>
                    <TableCell>{tx.influencer}</TableCell>
                    <TableCell>
                      <Badge variant={tx.status === 'paid' ? 'default' : 'outline'} className={tx.status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-0' : ''}>
                        {getStatusLabel(tx.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{tx.amount.toLocaleString()}원</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
