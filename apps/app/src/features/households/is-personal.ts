/** Whether a household is this User's own Personal household, presented as "Personal". */
export const isPersonalHousehold = (
	household: { personal_user_id: string | null },
	userId: string,
) => household.personal_user_id === userId;
