import type { Command } from "./commandtypes";

export const COMMANDS :Command[] = [
    {
        name : "new",
        description : "Create a new project",
        value : '/new'
    },
    {
        name : "agents",
        description : "Manage agents",
        value : '/agents'
    },
    {
        name : "session",
        description : "Manage sessions",
        value : '/session'
    },
    {
        name : "login",
        description : "Log in to your account",
        value : '/login'
    },
    {
        name : "logout",
        description : "Log out of your account",
        value : '/logout'
    },
    {
        name : "theme",
        description : "Change the theme",
        value : '/theme'
    },
    {
        name : "usage",
        description : "View your usage",
        value : '/usage'
    },
    {
        name : "exit",
        description : "Exit from anycode",
        value : '/exit',
        action : ( ctx ) => {
            ctx.exit()
        }
    },
    {
        name : "models",
        description : "Choose a new model",
        value : '/models'
    },
]