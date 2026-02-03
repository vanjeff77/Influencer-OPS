import { useLogin, useUser } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { KO } from "@/i18n/ko";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const { data: user } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password }, {
      onError: (err) => {
        toast({ 
          variant: "destructive",
          title: KO.pages.login.loginFailed, 
          description: err.message 
        });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-3 md:p-4">
      <Card className="w-full max-w-sm md:max-w-md shadow-xl border-border/50">
        <CardHeader className="space-y-0.5 md:space-y-1 text-center p-4 md:p-6">
          <CardTitle className="text-xl md:text-3xl font-display font-bold text-primary">{KO.pages.login.title}</CardTitle>
          <CardDescription className="text-xs md:text-sm">{KO.pages.login.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-xs md:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{KO.pages.login.username}</label>
              <Input 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="이메일을 입력하세요"
                className="bg-background h-9 md:h-10 text-sm"
                data-testid="input-username"
              />
            </div>
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-xs md:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{KO.pages.login.password}</label>
              <Input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••"
                className="bg-background h-9 md:h-10 text-sm"
                data-testid="input-password"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full font-semibold h-9 md:h-10 text-sm" 
              disabled={login.isPending}
              data-testid="button-login"
            >
              {login.isPending ? KO.pages.login.authenticating : KO.pages.login.signIn}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
