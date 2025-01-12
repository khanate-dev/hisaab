import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Hisaab" },
		{ name: "description", content: "Personal Finance Management System" },
	];
}

const Home = () => {
	return <div></div>;
};

export default Home;
