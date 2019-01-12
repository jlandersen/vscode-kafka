import * as path from "path";

export const imagesPath: string = path.join(__dirname, "../images");

const getDarkLightPath = (fileName: string) => {
    return {
        light: path.join(imagesPath, "light", fileName),
        dark: path.join(imagesPath, "dark", fileName),
    };
};

const getIconPath = (fileName: string) => {
    return path.join(imagesPath, fileName);
};

export const icons = {
    server: getDarkLightPath("server.svg"),
    serverConnected: getDarkLightPath("server-connected.svg"),
    topic: getDarkLightPath("topic.svg"),
    group: getDarkLightPath("group.svg"),
    warning: getIconPath("warning.svg"),
    information: getDarkLightPath("info.svg"),
};
