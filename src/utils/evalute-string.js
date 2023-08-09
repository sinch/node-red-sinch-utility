const parseToken = (token) => {
  const raw = token.replace("{{", "").replace("}}", "");
  const split = raw.split(".");

  return split.length === 0
    ? {
        variable: split[0],
      }
    : {
        variable: split[1],
        context: split[0],
      };
};

const getTokenValue = (token, { node, params = {} }) => {
  const { variable, context } = parseToken(token);
  if (context === "env" && node !== undefined) {
    const env = node._flow.env;
    if (env[variable] != null && env[variable].value != null) {
      return env[variable].value;
    }
  } else if (context === "global" && node !== undefined) {
    return node.context().global.get(variable);
  } else if (context === "flow" && node !== undefined) {
    return node.context().flow.get(variable);
  } else if (context === null || context === undefined) {
    return params[variable] || "";
  }

  return "";
};

module.exports = () => {
  return (str, params = {}) => {
    let result = str;
    const tokens = str.match(/(\{\{[A-Za-z0-9\.]*\}\})/gm) || [];

    tokens.forEach((token) => {
      result = result.replace(token, getTokenValue(token, params));
    });

    return result;
  };
};
