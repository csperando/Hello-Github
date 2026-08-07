import pool from "../config/db";
import { logger } from "../config/logger";
import { iOrg } from "../models/orgs";

// define the type of the return object from the repo() method
export interface iOrgsRepo {
    searchOrgs: (query: string, limit?:number, offset?: number, filter?: any) => Promise<any>;
    // getAllOrgs: (start?:number, size?: number) => Promise<any>;
    getOrgById: (orgId: number) => Promise<any>;
}

// main repo init function to be called in the service factories
const repo = (): iOrgsRepo => {
    const searchOrgs = async (query: string, limit?: number, offset?: number, filters?:any) => {
        try {
            const sqlString = `
                SELECT id
                    , ein
                    , name
                    , street
                    , city
                    , state
                    , zip
                FROM eo_bmf
                WHERE name LIKE $1
                ORDER BY name
                LIMIT 20;
            `;

            const result = await pool.query(sqlString, [`${query}%`]);
            return result.rows;

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    // const getAllOrgs = async (start?: number, size?: number, filters?:any) => {
    //     try {
    //         let sqlString = `
    //             SELECT id
    //                 , ein
    //                 , name
    //                 , street
    //                 , city
    //                 , state
    //                 , zip
    //             FROM eo_bmf
    //             ORDER BY name
    //         `;

    //         if(start && size) sqlString += `LIMIT ${start} OFFSET ${size};`;

    //         const result = await pool.query(sqlString);
    //         return result.rows;

    //     } catch(err: any) {
    //         logger.error(err);
    //         throw(err);
    //     }
    // }
    
    const getOrgById = async (orgId: number) => {
        try {
            const sqlString = `
                SELECT id
                    , ein
                    , name
                    , street
                    , city
                    , state
                    , zip
                FROM eo_bmf
                WHERE id = $1;
            `;

            const result = await pool.query(sqlString, [orgId]);
            return result.rows[0];

        } catch(err: any) {
            logger.error(err);
            throw(err);
        }
    }

    return {
        searchOrgs,
        getOrgById,
    }
};

export default { repo };
