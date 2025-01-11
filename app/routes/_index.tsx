import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Hisaab" },
    { name: "description", content: "Personal Finance Management System" },
  ];
};

const Index = () => {
  return <div></div>;
};

export default Index;
