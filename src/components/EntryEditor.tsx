// @ts-nocheck
import React, { useEffect, useState } from "react";
import {
  Badge,
  DisplayText,
  Card,
  Stack,
  Heading,
  SkeletonContainer,
  SkeletonBodyText,
} from "@contentful/f36-components";
import { Tree } from "antd";
import { Workbench } from "@contentful/f36-workbench";
import "antd/dist/antd.min.css";

const TreeCard = ({
  title,
  expectedNumItems,
  treeData,
  onSelect,
  loadData,
}) => (
  <Card>
    <Heading>{title}</Heading>
    {treeData.length === 0 && (
      <SkeletonContainer svgHeight={expectedNumItems * 28}>
        <SkeletonBodyText
          numberOfLines={expectedNumItems}
          offsetTop={4}
          marginBottom={12}
        />
      </SkeletonContainer>
    )}
    {treeData.length > 0 && (
      <Tree
        onSelect={onSelect}
        treeData={treeData}
        showLine
        loadData={loadData}
        autoExpandParent
        selectedKeys={[]}
      />
    )}
  </Card>
);

const Entry = ({ sdk, cma }) => {
  // State setup for the 2 menu locations
  const [topNavigationTree, setTopNavigationTree] = useState([]);
  const [footerNavigationTree, setFooterNavigationTree] = useState([]);

  /**
   * Get all contentful entries for an array of ids
   * @param ids (array) List of ids to retrieve from Contentful
   * @returns (object) Formatted object where each key is an entry id
   */
  const getEntries = async (ids) => {
    // Get the entries from the CMA
    const { items } = await cma.entry.getMany({
      query: { "sys.id[in]": ids.join(",") },
    });

    // Change the structure so we can select by id in the future
    const entries = {}; // Empty object
    items.forEach((item) => {
      entries[item.sys.id] = item; // Add each entry into the object with it's id as the key
    });

    return entries;
  };

  useEffect(() => {
    // Get the items in the top level of the tree
    const topNavigationIds = sdk.entry.fields.topNavigation
      .getValue()
      .map((e) => e.sys.id);

    const footerNavigationIds = sdk.entry.fields.footerNavigation
      .getValue()
      .map((e) => e.sys.id);

    // Get the entries for both of those menus
    getEntries(topNavigationIds).then((entries) => {
      // Get the tree structure for this level
      const tree = createSubTree(topNavigationIds, entries);

      // Set the state
      setTopNavigationTree(tree);
    });

    getEntries(footerNavigationIds).then((entries) => {
      // Get the tree structure for this level
      const tree = createSubTree(footerNavigationIds, entries);

      // Set the state
      setFooterNavigationTree(tree);
    });
  }, [sdk.entry.fields.footerNavigation, sdk.entry.fields.topNavigation]);

  /**
   * Show the relevant content item when it is selected in the tree
   * @param selectedKeys (array) Selected items from the tree (should only be 1 and will be the id of a content entry)
   * @param info Not used
   */
  const onSelect = (selectedKeys, info) => {
    sdk.navigator.openEntry(selectedKeys[0], { slideIn: true });
  };

  /**
   * Handle lazy loading for the top navigation menu
   * @param node (object) Represents the 'parent' node in the tree that is being opened
   * @returns (Promise) When resolved will have updated the state with the new layer of the tree
   */
  const handleLoadTop = (node) => handleLoad(node, setTopNavigationTree);

  /**
   * Handle lazy loading for the footer navigation menu
   * @param node (object) Represents the 'parent' node in the tree that is being opened
   * @returns (Promise) When resolved will have updated the state with the new layer of the tree
   */
  const handleLoadFooter = (node) => handleLoad(node, setFooterNavigationTree);

  /**
   * Load a new layer of the tree into the state and re-render the tree
   * @param node (object) Represents the 'parent' node in the tree that is being opened
   * @param stateFunc (function) The state function to run to update the state (either for top nav or footer nav)
   * @returns (Promise) When resolved will have updated the state with the new layer of the tree
   */
  const handleLoad = ({ children, key, contentful }, stateFunc) =>
    new Promise((resolve) => {
      // If this node already has children, no need to load them again
      if (children) {
        resolve();
        return;
      }

      // Handle a Shopify endpoint which should link out to Shopify. However all we have are product ids, and no way to connect them to Shopify URLs.
      if (contentful.shopify) {
        // The children will just be disabled nodes at this point
        // TODO: Can we handle this any better?
        const children = [];

        // Loop through the Shopify ids and create a disabled node for each
        contentful.shopify.forEach((id) => {
          children.push({
            title: "Shopify Product",
            key: id,
            isLeaf: true,
            disabled: true,
          });
        });

        // Update the state to reflect the new tree structure
        stateFunc((origin) => updateTreeData(origin, key, children));

        resolve();
        return;
      }

      // Get the contentful children for this node so we can load them from the CMA and insert into the state
      if (contentful.children) {
        getEntries(contentful.children).then((entries) => {
          // Create the children tree nodes
          const children = createSubTree(contentful.children, entries);

          // Update the state to reflect the new tree structure
          stateFunc((origin) => updateTreeData(origin, key, children));

          resolve();
        });
      }
      else {
        // This is a catch-all just in case this is a blank content type with no children (yet)
        resolve();
      }
    });

  /**
   * Creates a new tree structure for a set of entries. The entries aren't guaranteed to be in the correct order as per the reference fields, so we take the order from the ids array.
   * @param ids (array) Ids of the new tree branch in order
   * @param entries (array) Contentful entries corresponding to those ids above
   * @returns (array) Subtree nodes formatted correctly
   */
  function createSubTree(ids, entries) {
    // Create the tree format
    const subTree = [];

    // Loop through the ids in order so we get the correct order as it is in the reference field in the editor pane
    ids.forEach((id) => {
      // Find the corresponding entry
      const entry = entries[id];

      // We will assume it's not a leaf (final node in the tree)
      let isLeaf = false;

      // Set up the Contentful data object
      const contentfulData = {
        contentType: entry.sys.contentType.sys.id,
      };

      // Add children to the Contentful data object if there are child entries
      if (contentfulData.contentType === "navTab") {
        // navTab's children are in the `menuSections` field
        if (entry.fields.menuSections) {
          contentfulData.children = entry.fields.menuSections["en-US"].map(
            (e) => e.sys.id
          );
        }
      } else if (contentfulData.contentType === "navSectionContentful") {
        // navSectionContentful's children are in the `links` field
        if (entry.fields.links) {
          contentfulData.children = entry.fields.links["en-US"].map(
            (e) => e.sys.id
          );
        }
      } else if (contentfulData.contentType === "navSectionPromo") {
        // navSectionPromo's children are in the `targetCollection` field
        if (entry.fields.targetCollection) {
          // This is a single reference field so we'll wrap it in an array to treat it as a list of 1
          contentfulData.children = [
            entry.fields.targetCollection["en-US"].sys.id,
          ];
        }
      } else if (contentfulData.contentType === "navSectionShopify") {
        // navSectionShopify's children are Shopify product ids, so we'll add those to a separate array so we can treat them differently in the future
        if (entry.fields.links)
          contentfulData.shopify = entry.fields.links["en-US"];
      } else {
        // If this isn't one of the content types above then we'll assume it's a leaf and has no children
        isLeaf = true;
      }

      // Add this node to the subtree
      subTree.push({
        title: (
          <>
            {entry.fields.internalName["en-US"]}{" "}
            <Badge variant="secondary" size="small">
              {entry.sys.contentType.sys.id}
            </Badge>
          </>
        ),
        key: entry.sys.id,
        contentful: contentfulData,
        isLeaf,
      });
    });

    return subTree;
  }

  /**
   * Traverses the current tree to find out where to insert the a new subtree
   * @param list (array) The current tree
   * @param key (string) The key of the node to add the child subtree to
   * @param children (array) The children array to insert into the tree
   * @returns (array) The new tree with the new child nodes inserted
   */
  function updateTreeData(list, key, children) {
    return list.map((node) => {
      if (node.key === key) {
        return {
          ...node,
          children,
        };
      }
      if (node.children) {
        return {
          ...node,
          children: updateTreeData(node.children, key, children),
        };
      }
      return node;
    });
  }

  return (
    <Workbench>
      <Workbench.Content type="text">
        <DisplayText>Navigation Viewer</DisplayText>
        <Stack flexDirection="column" spacing="spacingM">
          <TreeCard
            title="Top Navigation"
            treeData={topNavigationTree}
            expectedNumItems={sdk.entry.fields.topNavigation.getValue().length}
            onSelect={onSelect}
            loadData={handleLoadTop}
          />
          <TreeCard
            title="Footer Navigation"
            treeData={footerNavigationTree}
            expectedNumItems={
              sdk.entry.fields.footerNavigation.getValue().length
            }
            onSelect={onSelect}
            loadData={handleLoadFooter}
          />
        </Stack>
      </Workbench.Content>
    </Workbench>
  );
};

export default Entry;
