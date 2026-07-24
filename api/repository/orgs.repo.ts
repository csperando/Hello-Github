import pool from "../config/db";
import { logger } from "../config/logger";
import { iOrg } from "../models/orgs";

// define the type of the return object from the repo() method
export interface iOrgsRepo {
    getAllOrgs: () => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iOrgsRepo => {
    const getAllOrgs = async () => {
        try {
            const sqlString = `
                SELECT id
                    , ein
                    , name
                    , street
                    , city
                    , state
                    , zip
                FROM eo_bmf;
            `
            const result = await pool.query(sqlString);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        getAllOrgs,
    }
};

export default { repo };
